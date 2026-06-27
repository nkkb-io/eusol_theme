import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate


@frappe.whitelist()
def get_pos_profile_defaults():
	"""Returns company, warehouse, and price list defaults for the POS session."""
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	return {
		"company": company,
		"warehouse": warehouse,
		"currency": frappe.db.get_value("Company", company, "default_currency") if company else "GHS",
	}


@frappe.whitelist()
def create_pos_invoice(cart, payments, customer=None, discount_amount=0):
	"""
	Creates and submits a Sales Invoice from the POS cart.

	cart: JSON string or list of {item_code, qty, rate}
	payments: JSON string or list of {mode_of_payment, amount}
	customer: Customer ID, or None for Walk-in Customer
	discount_amount: flat discount applied to the invoice
	"""
	if isinstance(cart, str):
		cart = json.loads(cart)
	if isinstance(payments, str):
		payments = json.loads(payments)

	if not cart:
		frappe.throw(_("Cart is empty"))

	defaults = get_pos_profile_defaults()
	company = defaults.get("company")
	warehouse = defaults.get("warehouse")

	if not company:
		frappe.throw(_("No default Company is configured. Please set one in Global Defaults."))

	customer = customer or get_or_create_walkin_customer()

	si = frappe.new_doc("Sales Invoice")
	si.customer = customer
	si.company = company
	si.is_pos = 1
	si.due_date = nowdate()

	for line in cart:
		si.append(
			"items",
			{
				"item_code": line.get("item_code"),
				"qty": flt(line.get("qty")),
				"rate": flt(line.get("rate")),
				"warehouse": warehouse,
			},
		)

	if flt(discount_amount) > 0:
		si.apply_discount_on = "Grand Total"
		si.discount_amount = flt(discount_amount)

	for p in payments:
		si.append(
			"payments",
			{
				"mode_of_payment": map_mode_of_payment(p.get("mode_of_payment")),
				"amount": flt(p.get("amount")),
			},
		)

	si.insert(ignore_permissions=True)
	si.submit()

	# Award loyalty points: 1 point per GHS 100 spent, only for registered customers
	if customer != get_or_create_walkin_customer():
		award_loyalty_points(customer, si.grand_total, si.name)

	return {
		"invoice": si.name,
		"grand_total": si.grand_total,
		"customer": si.customer,
	}


def map_mode_of_payment(method_key):
	"""Maps our POS UI payment keys to actual ERPNext Mode of Payment records.
	Falls back to creating a simple cash-equivalent mapping if not found."""
	mapping = {
		"cash": "Cash",
		"momo": "MoMo",
		"card": "Card",
		"gift": "Gift Card",
		"credit": "Credit",
	}
	mode_name = mapping.get(method_key, "Cash")

	if not frappe.db.exists("Mode of Payment", mode_name):
		# Auto-create on first use so the cashier isn't blocked by missing setup
		doc = frappe.new_doc("Mode of Payment")
		doc.mode_of_payment = mode_name
		doc.enabled = 1
		doc.insert(ignore_permissions=True)

	return mode_name


def get_or_create_walkin_customer():
	name = "Walk-in Customer"
	if not frappe.db.exists("Customer", name):
		doc = frappe.new_doc("Customer")
		doc.customer_name = name
		doc.customer_type = "Individual"
		doc.insert(ignore_permissions=True)
	return name


def award_loyalty_points(customer, grand_total, invoice):
	"""1 loyalty point per GHS 100 spent."""
	points = int(flt(grand_total) // 100)
	if points <= 0:
		return
	try:
		entry = frappe.new_doc("Loyalty Point Entry")
		entry.customer = customer
		entry.loyalty_program = frappe.db.get_value("Customer", customer, "loyalty_program")
		entry.loyalty_points = points
		entry.purchase_amount = grand_total
		entry.invoice_type = "Sales Invoice"
		entry.invoice = invoice
		entry.posting_date = nowdate()
		entry.expiry_date = frappe.utils.add_years(nowdate(), 1)
		entry.insert(ignore_permissions=True)
	except Exception:
		# Loyalty Program may not be configured for this customer; fail silently
		# so checkout is never blocked by points logic.
		frappe.log_error(frappe.get_traceback(), "Eusol POS Loyalty Point Entry Failed")


@frappe.whitelist()
def check_credit_limit(customer, amount):
	"""Returns whether the customer's outstanding + new amount is within their credit limit."""
	credit_limit = flt(frappe.db.get_value("Customer", customer, "credit_limit"))
	if not credit_limit:
		return {"allowed": True, "credit_limit": 0, "outstanding": 0}

	outstanding = flt(
		frappe.db.sql(
			"""select sum(outstanding_amount) from `tabSales Invoice`
			where customer=%s and docstatus=1""",
			customer,
		)[0][0]
		or 0
	)

	allowed = (outstanding + flt(amount)) <= credit_limit
	return {"allowed": allowed, "credit_limit": credit_limit, "outstanding": outstanding}


@frappe.whitelist()
def paystack_initialize(email, amount, reference):
	"""Initializes a Paystack transaction. Requires paystack_secret_key in site_config.json."""
	import requests

	secret_key = frappe.conf.get("paystack_secret_key")
	if not secret_key:
		frappe.throw(
			_(
				"Paystack is not configured yet. Add 'paystack_secret_key' to your site_config.json to enable card payments."
			)
		)

	url = "https://api.paystack.co/transaction/initialize"
	headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
	payload = {
		"email": email,
		"amount": int(flt(amount) * 100),  # Paystack expects amount in pesewas/kobo
		"reference": reference,
		"currency": "GHS",
	}
	response = requests.post(url, json=payload, headers=headers, timeout=15)
	data = response.json()

	if not data.get("status"):
		frappe.throw(_("Paystack error: {0}").format(data.get("message")))

	return data.get("data")


@frappe.whitelist()
def paystack_verify(reference):
	"""Verifies a Paystack transaction by reference."""
	import requests

	secret_key = frappe.conf.get("paystack_secret_key")
	if not secret_key:
		frappe.throw(_("Paystack is not configured."))

	url = f"https://api.paystack.co/transaction/verify/{reference}"
	headers = {"Authorization": f"Bearer {secret_key}"}
	response = requests.get(url, headers=headers, timeout=15)
	data = response.json()

	if not data.get("status"):
		frappe.throw(_("Could not verify Paystack transaction."))

	return data.get("data")


# ============================================================
# PHASE 4: SHIFT / ATTENDANCE (uses HRMS Employee Checkin)
# ============================================================

def _get_employee_for_user():
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(
			_(
				"No Employee record is linked to your user account ({0}). "
				"Ask an admin to link one in Employee > User ID, so shifts can be tracked."
			).format(frappe.session.user)
		)
	return employee


@frappe.whitelist()
def get_shift_status():
	"""Returns whether the current user is currently clocked in, and since when."""
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return {"linked": False}

	last_log = frappe.get_all(
		"Employee Checkin",
		filters={"employee": employee},
		fields=["log_type", "time"],
		order_by="time desc",
		limit=1,
	)

	clocked_in = bool(last_log and last_log[0].log_type == "IN")
	return {
		"linked": True,
		"employee": employee,
		"clocked_in": clocked_in,
		"since": last_log[0].time if clocked_in else None,
	}


@frappe.whitelist()
def clock_in():
	employee = _get_employee_for_user()
	doc = frappe.new_doc("Employee Checkin")
	doc.employee = employee
	doc.log_type = "IN"
	doc.time = frappe.utils.now_datetime()
	doc.insert(ignore_permissions=True)
	return {"ok": True, "time": doc.time}


@frappe.whitelist()
def clock_out():
	employee = _get_employee_for_user()
	doc = frappe.new_doc("Employee Checkin")
	doc.employee = employee
	doc.log_type = "OUT"
	doc.time = frappe.utils.now_datetime()
	doc.insert(ignore_permissions=True)
	return {"ok": True, "time": doc.time}
