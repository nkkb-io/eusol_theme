import frappe

def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login"
        raise frappe.Redirect
    
    user = frappe.session.user
    roles = frappe.get_roles(user)
    
    if "System Manager" in roles or "CEO" in roles:
        context.role = "ceo"
    elif "Accounts Manager" in roles or "Accounts User" in roles:
        context.role = "accountant"
    elif "Stock Manager" in roles or "Stock User" in roles:
        context.role = "warehouse"
    elif "HR Manager" in roles or "HR User" in roles:
        context.role = "hr"
    elif "Sales User" in roles:
        context.role = "cashier"
    else:
        context.role = "default"
    
    context.user_name = frappe.get_value("User", user, "full_name") or user
    context.no_cache = 1
