import frappe

def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login"
        raise frappe.Redirect
    context.no_cache = 1
    context.user_name = frappe.get_value("User", frappe.session.user, "full_name") or frappe.session.user
    context.user_initials = "".join([n[0].upper() for n in (context.user_name or "PO").split()[:2]])
