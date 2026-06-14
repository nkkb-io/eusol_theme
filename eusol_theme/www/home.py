import frappe
from frappe import _


def get_context(context):
    # Redirect guests to login
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/signin"
        raise frappe.Redirect

    context.no_cache = 1
    user = frappe.session.user
    user_doc = frappe.get_doc("User", user)
    context.user_fullname = user_doc.full_name or user_doc.first_name or user
    context.user_email = user

    # Get user's role profile
    role_profile = user_doc.role_profile_name or ""
    context.role_profile = role_profile

    # Map role profile to dashboard config
    context.dashboard = get_dashboard_for_role(role_profile)


def get_dashboard_for_role(role_profile):
    dashboards = {
        "CEO": {
            "title": "Executive Dashboard",
            "subtitle": "Full business overview",
            "sections": [
                {
                    "title": "Finance",
                    "cards": [
                        {"icon": "💰", "label": "Accounts Receivable", "url": "/app/accounts-receivable"},
                        {"icon": "📊", "label": "Profit & Loss", "url": "/app/profit-and-loss-statement"},
                        {"icon": "🏦", "label": "Balance Sheet", "url": "/app/balance-sheet"},
                        {"icon": "💳", "label": "Payment Entry", "url": "/app/payment-entry"},
                    ]
                },
                {
                    "title": "Sales",
                    "cards": [
                        {"icon": "📈", "label": "Sales Analytics", "url": "/app/sales-analytics"},
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "🛒", "label": "Sales Order", "url": "/app/sales-order"},
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                    ]
                },
                {
                    "title": "Operations",
                    "cards": [
                        {"icon": "📦", "label": "Stock Summary", "url": "/app/stock-balance"},
                        {"icon": "🏭", "label": "Work Orders", "url": "/app/work-order"},
                        {"icon": "👤", "label": "Employees", "url": "/app/employee"},
                        {"icon": "⚙️", "label": "System Settings", "url": "/app/system-settings"},
                    ]
                },
            ]
        },
        "System Administrator": {
            "title": "System Administration",
            "subtitle": "Manage system settings and users",
            "sections": [
                {
                    "title": "Users & Access",
                    "cards": [
                        {"icon": "👤", "label": "Users", "url": "/app/user"},
                        {"icon": "🔐", "label": "Role Profile", "url": "/app/role-profile"},
                        {"icon": "🛡️", "label": "Roles", "url": "/app/role"},
                        {"icon": "🔑", "label": "Permissions", "url": "/app/role-permission-manager"},
                    ]
                },
                {
                    "title": "System",
                    "cards": [
                        {"icon": "⚙️", "label": "System Settings", "url": "/app/system-settings"},
                        {"icon": "📧", "label": "Email Account", "url": "/app/email-account"},
                        {"icon": "🔔", "label": "Notification", "url": "/app/notification"},
                        {"icon": "📋", "label": "Error Log", "url": "/app/error-log"},
                    ]
                },
                {
                    "title": "Data",
                    "cards": [
                        {"icon": "💾", "label": "Backup", "url": "/app/backup"},
                        {"icon": "📥", "label": "Data Import", "url": "/app/data-import"},
                        {"icon": "📤", "label": "Data Export", "url": "/app/data-export-log"},
                        {"icon": "🔄", "label": "Scheduled Jobs", "url": "/app/scheduled-job-log"},
                    ]
                },
            ]
        },
        "Accounts": {
            "title": "Accounts Dashboard",
            "subtitle": "Financial management",
            "sections": [
                {
                    "title": "Transactions",
                    "cards": [
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "🧾", "label": "Purchase Invoice", "url": "/app/purchase-invoice"},
                        {"icon": "💳", "label": "Payment Entry", "url": "/app/payment-entry"},
                        {"icon": "📔", "label": "Journal Entry", "url": "/app/journal-entry"},
                    ]
                },
                {
                    "title": "Reports",
                    "cards": [
                        {"icon": "📊", "label": "Profit & Loss", "url": "/app/profit-and-loss-statement"},
                        {"icon": "🏦", "label": "Balance Sheet", "url": "/app/balance-sheet"},
                        {"icon": "💰", "label": "Accounts Receivable", "url": "/app/accounts-receivable"},
                        {"icon": "💸", "label": "Accounts Payable", "url": "/app/accounts-payable"},
                    ]
                },
                {
                    "title": "Masters",
                    "cards": [
                        {"icon": "📁", "label": "Chart of Accounts", "url": "/app/account"},
                        {"icon": "💱", "label": "Currency", "url": "/app/currency"},
                        {"icon": "🏷️", "label": "Cost Center", "url": "/app/cost-center"},
                        {"icon": "📅", "label": "Fiscal Year", "url": "/app/fiscal-year"},
                    ]
                },
            ]
        },
        "HR": {
            "title": "HR Dashboard",
            "subtitle": "Human resources management",
            "sections": [
                {
                    "title": "Employees",
                    "cards": [
                        {"icon": "👤", "label": "Employees", "url": "/app/employee"},
                        {"icon": "🆕", "label": "New Employee", "url": "/app/employee/new-employee-1"},
                        {"icon": "🏢", "label": "Departments", "url": "/app/department"},
                        {"icon": "📋", "label": "Designation", "url": "/app/designation"},
                    ]
                },
                {
                    "title": "Payroll",
                    "cards": [
                        {"icon": "💰", "label": "Payroll Entry", "url": "/app/payroll-entry"},
                        {"icon": "📄", "label": "Salary Slip", "url": "/app/salary-slip"},
                        {"icon": "🏗️", "label": "Salary Structure", "url": "/app/salary-structure"},
                        {"icon": "📊", "label": "Salary Reports", "url": "/app/salary-register"},
                    ]
                },
                {
                    "title": "Leave & Attendance",
                    "cards": [
                        {"icon": "🗓️", "label": "Leave Application", "url": "/app/leave-application"},
                        {"icon": "✅", "label": "Attendance", "url": "/app/attendance"},
                        {"icon": "⏰", "label": "Overtime", "url": "/app/overtime"},
                        {"icon": "📅", "label": "Holiday List", "url": "/app/holiday-list"},
                    ]
                },
            ]
        },
        "HR Assistant": {
            "title": "HR Assistant",
            "subtitle": "Employee records and leave",
            "sections": [
                {
                    "title": "Employees",
                    "cards": [
                        {"icon": "👤", "label": "Employees", "url": "/app/employee"},
                        {"icon": "🏢", "label": "Departments", "url": "/app/department"},
                        {"icon": "📋", "label": "Designation", "url": "/app/designation"},
                        {"icon": "📞", "label": "Employee Contact", "url": "/app/employee"},
                    ]
                },
                {
                    "title": "Leave & Attendance",
                    "cards": [
                        {"icon": "🗓️", "label": "Leave Application", "url": "/app/leave-application"},
                        {"icon": "✅", "label": "Attendance", "url": "/app/attendance"},
                        {"icon": "📅", "label": "Holiday List", "url": "/app/holiday-list"},
                        {"icon": "📄", "label": "Leave Balance", "url": "/app/leave-allocation"},
                    ]
                },
            ]
        },
        "Inventory": {
            "title": "Inventory Dashboard",
            "subtitle": "Stock and warehouse management",
            "sections": [
                {
                    "title": "Stock",
                    "cards": [
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔄", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "📋", "label": "Stock Ledger", "url": "/app/stock-ledger"},
                        {"icon": "🔍", "label": "Stock Reconciliation", "url": "/app/stock-reconciliation"},
                    ]
                },
                {
                    "title": "Items",
                    "cards": [
                        {"icon": "🏷️", "label": "Items", "url": "/app/item"},
                        {"icon": "📁", "label": "Item Groups", "url": "/app/item-group"},
                        {"icon": "📐", "label": "UOM", "url": "/app/uom"},
                        {"icon": "🏷️", "label": "Price List", "url": "/app/price-list"},
                    ]
                },
                {
                    "title": "Warehouse",
                    "cards": [
                        {"icon": "🏭", "label": "Warehouses", "url": "/app/warehouse"},
                        {"icon": "📤", "label": "Delivery Note", "url": "/app/delivery-note"},
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                        {"icon": "📊", "label": "Inventory Reports", "url": "/app/stock-analytics"},
                    ]
                },
            ]
        },
        "Manufacturing": {
            "title": "Manufacturing Dashboard",
            "subtitle": "Production and BOM management",
            "sections": [
                {
                    "title": "Production",
                    "cards": [
                        {"icon": "🏭", "label": "Work Order", "url": "/app/work-order"},
                        {"icon": "📋", "label": "Production Plan", "url": "/app/production-plan"},
                        {"icon": "🔄", "label": "Job Card", "url": "/app/job-card"},
                        {"icon": "📊", "label": "Production Reports", "url": "/app/production-analytics"},
                    ]
                },
                {
                    "title": "BOM",
                    "cards": [
                        {"icon": "📐", "label": "Bill of Materials", "url": "/app/bom"},
                        {"icon": "🏷️", "label": "Items", "url": "/app/item"},
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔍", "label": "BOM Stock Report", "url": "/app/bom-stock-report"},
                    ]
                },
            ]
        },
        "Operations Manager": {
            "title": "Operations Dashboard",
            "subtitle": "Cross-functional operations overview",
            "sections": [
                {
                    "title": "Sales & Orders",
                    "cards": [
                        {"icon": "🛒", "label": "Sales Orders", "url": "/app/sales-order"},
                        {"icon": "📤", "label": "Delivery Notes", "url": "/app/delivery-note"},
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                    ]
                },
                {
                    "title": "Inventory",
                    "cards": [
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔄", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "🏭", "label": "Warehouses", "url": "/app/warehouse"},
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                    ]
                },
                {
                    "title": "Manufacturing",
                    "cards": [
                        {"icon": "🏭", "label": "Work Orders", "url": "/app/work-order"},
                        {"icon": "📋", "label": "Production Plan", "url": "/app/production-plan"},
                        {"icon": "👤", "label": "Employees", "url": "/app/employee"},
                        {"icon": "📊", "label": "Analytics", "url": "/app/sales-analytics"},
                    ]
                },
            ]
        },
        "Point of Sales": {
            "title": "Point of Sale",
            "subtitle": "Sales and payments",
            "sections": [
                {
                    "title": "POS",
                    "cards": [
                        {"icon": "🖥️", "label": "Open POS", "url": "/app/point-of-sale"},
                        {"icon": "🧾", "label": "POS Invoices", "url": "/app/pos-invoice"},
                        {"icon": "💳", "label": "POS Closing", "url": "/app/pos-closing-entry"},
                        {"icon": "🏷️", "label": "POS Profile", "url": "/app/pos-profile"},
                    ]
                },
                {
                    "title": "Items & Customers",
                    "cards": [
                        {"icon": "🏷️", "label": "Items", "url": "/app/item"},
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                        {"icon": "💰", "label": "Price List", "url": "/app/price-list"},
                        {"icon": "💳", "label": "Payment Entry", "url": "/app/payment-entry"},
                    ]
                },
            ]
        },
        "Production Manager": {
            "title": "Production Manager",
            "subtitle": "Manage production and workers",
            "sections": [
                {
                    "title": "Production",
                    "cards": [
                        {"icon": "🏭", "label": "Work Orders", "url": "/app/work-order"},
                        {"icon": "📋", "label": "Production Plan", "url": "/app/production-plan"},
                        {"icon": "🔄", "label": "Job Cards", "url": "/app/job-card"},
                        {"icon": "📐", "label": "BOM", "url": "/app/bom"},
                    ]
                },
                {
                    "title": "Resources",
                    "cards": [
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔄", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "👤", "label": "Employees", "url": "/app/employee"},
                        {"icon": "📊", "label": "Production Analytics", "url": "/app/production-analytics"},
                    ]
                },
            ]
        },
        "Production Worker": {
            "title": "Production",
            "subtitle": "Your work orders and job cards",
            "sections": [
                {
                    "title": "My Work",
                    "cards": [
                        {"icon": "🔄", "label": "My Job Cards", "url": "/app/job-card"},
                        {"icon": "🏭", "label": "Work Orders", "url": "/app/work-order"},
                        {"icon": "📦", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "✅", "label": "My Attendance", "url": "/app/attendance"},
                    ]
                },
            ]
        },
        "Purchase": {
            "title": "Purchase Dashboard",
            "subtitle": "Procurement and suppliers",
            "sections": [
                {
                    "title": "Orders",
                    "cards": [
                        {"icon": "🛒", "label": "Purchase Order", "url": "/app/purchase-order"},
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                        {"icon": "🧾", "label": "Purchase Invoice", "url": "/app/purchase-invoice"},
                        {"icon": "📋", "label": "Material Request", "url": "/app/material-request"},
                    ]
                },
                {
                    "title": "Suppliers",
                    "cards": [
                        {"icon": "🏢", "label": "Suppliers", "url": "/app/supplier"},
                        {"icon": "💰", "label": "Supplier Quotation", "url": "/app/supplier-quotation"},
                        {"icon": "💳", "label": "Payment Entry", "url": "/app/payment-entry"},
                        {"icon": "📊", "label": "Purchase Analytics", "url": "/app/purchase-analytics"},
                    ]
                },
            ]
        },
        "Purchasing Officer": {
            "title": "Purchasing",
            "subtitle": "Purchase orders and suppliers",
            "sections": [
                {
                    "title": "Purchase",
                    "cards": [
                        {"icon": "🛒", "label": "Purchase Order", "url": "/app/purchase-order"},
                        {"icon": "📋", "label": "Material Request", "url": "/app/material-request"},
                        {"icon": "💰", "label": "Supplier Quotation", "url": "/app/supplier-quotation"},
                        {"icon": "🏢", "label": "Suppliers", "url": "/app/supplier"},
                    ]
                },
                {
                    "title": "Receiving",
                    "cards": [
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                        {"icon": "🧾", "label": "Purchase Invoice", "url": "/app/purchase-invoice"},
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "📊", "label": "Purchase Reports", "url": "/app/purchase-analytics"},
                    ]
                },
            ]
        },
        "Sales": {
            "title": "Sales Dashboard",
            "subtitle": "Sales and customer management",
            "sections": [
                {
                    "title": "Orders",
                    "cards": [
                        {"icon": "🛒", "label": "Sales Order", "url": "/app/sales-order"},
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "📤", "label": "Delivery Note", "url": "/app/delivery-note"},
                        {"icon": "💰", "label": "Quotation", "url": "/app/quotation"},
                    ]
                },
                {
                    "title": "Customers",
                    "cards": [
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                        {"icon": "📞", "label": "CRM Lead", "url": "/app/crm-lead"},
                        {"icon": "💳", "label": "Payment Entry", "url": "/app/payment-entry"},
                        {"icon": "📊", "label": "Sales Analytics", "url": "/app/sales-analytics"},
                    ]
                },
            ]
        },
        "Sales Executive": {
            "title": "Sales Executive",
            "subtitle": "Your sales pipeline",
            "sections": [
                {
                    "title": "Sales",
                    "cards": [
                        {"icon": "💰", "label": "Quotation", "url": "/app/quotation"},
                        {"icon": "🛒", "label": "Sales Order", "url": "/app/sales-order"},
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                    ]
                },
                {
                    "title": "CRM",
                    "cards": [
                        {"icon": "📞", "label": "Leads", "url": "/app/crm-lead"},
                        {"icon": "🤝", "label": "Opportunities", "url": "/app/crm-deal"},
                        {"icon": "📤", "label": "Delivery Note", "url": "/app/delivery-note"},
                        {"icon": "📊", "label": "My Sales Report", "url": "/app/sales-analytics"},
                    ]
                },
            ]
        },
        "Sales Manager": {
            "title": "Sales Manager",
            "subtitle": "Team sales overview",
            "sections": [
                {
                    "title": "Sales",
                    "cards": [
                        {"icon": "📈", "label": "Sales Analytics", "url": "/app/sales-analytics"},
                        {"icon": "🛒", "label": "Sales Orders", "url": "/app/sales-order"},
                        {"icon": "🧾", "label": "Sales Invoice", "url": "/app/sales-invoice"},
                        {"icon": "💰", "label": "Quotations", "url": "/app/quotation"},
                    ]
                },
                {
                    "title": "Team & Customers",
                    "cards": [
                        {"icon": "👥", "label": "Customers", "url": "/app/customer"},
                        {"icon": "📞", "label": "Leads", "url": "/app/crm-lead"},
                        {"icon": "🤝", "label": "Opportunities", "url": "/app/crm-deal"},
                        {"icon": "📤", "label": "Delivery Notes", "url": "/app/delivery-note"},
                    ]
                },
            ]
        },
        "Store Keeper": {
            "title": "Store Dashboard",
            "subtitle": "Stock and warehouse operations",
            "sections": [
                {
                    "title": "Stock",
                    "cards": [
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔄", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                        {"icon": "📤", "label": "Delivery Note", "url": "/app/delivery-note"},
                    ]
                },
                {
                    "title": "Items",
                    "cards": [
                        {"icon": "🏷️", "label": "Items", "url": "/app/item"},
                        {"icon": "🏭", "label": "Warehouses", "url": "/app/warehouse"},
                        {"icon": "📋", "label": "Stock Ledger", "url": "/app/stock-ledger"},
                        {"icon": "🔍", "label": "Stock Reconciliation", "url": "/app/stock-reconciliation"},
                    ]
                },
            ]
        },
        "Warehouse": {
            "title": "Warehouse Dashboard",
            "subtitle": "Warehouse and stock operations",
            "sections": [
                {
                    "title": "Operations",
                    "cards": [
                        {"icon": "📦", "label": "Stock Balance", "url": "/app/stock-balance"},
                        {"icon": "🔄", "label": "Stock Entry", "url": "/app/stock-entry"},
                        {"icon": "📥", "label": "Purchase Receipt", "url": "/app/purchase-receipt"},
                        {"icon": "📤", "label": "Delivery Note", "url": "/app/delivery-note"},
                    ]
                },
                {
                    "title": "Reports",
                    "cards": [
                        {"icon": "📋", "label": "Stock Ledger", "url": "/app/stock-ledger"},
                        {"icon": "🏭", "label": "Warehouses", "url": "/app/warehouse"},
                        {"icon": "🔍", "label": "Stock Reconciliation", "url": "/app/stock-reconciliation"},
                        {"icon": "📊", "label": "Stock Analytics", "url": "/app/stock-analytics"},
                    ]
                },
            ]
        },
    }

    # Default fallback for unmapped roles
    default = {
        "title": "Welcome",
        "subtitle": "Eusol Organics Business Portal",
        "sections": [
            {
                "title": "Quick Access",
                "cards": [
                    {"icon": "🏠", "label": "Desk", "url": "/app"},
                    {"icon": "👤", "label": "My Profile", "url": "/app/user/" + frappe.session.user},
                ]
            }
        ]
    }

    return dashboards.get(role_profile, default)
