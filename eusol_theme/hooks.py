app_name = "eusol_theme"
app_title = "Eusol Organics"
app_publisher = "Eusol Organics"
app_description = "Custom theme for Eusol Organics ERP"
app_email = "eusolghana@gmail.com"
app_license = "MIT"
app_version = "1.0.0"

# ── Redirect /login to branded /signin ──
website_redirects = [
    {"source": "/login", "target": "/signin"},
]

# ── Inject CSS into desk ──
app_include_css = [
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap",
    "/assets/eusol_theme/css/desk.css",
]

# ── Inject CSS into web pages ──
web_include_css = [
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap",
]

# ── Override app title shown in browser tab ──
app_include_js = [
    "/assets/eusol_theme/js/desk_override.js",
]

# ── Favicon ──
favicon = "/files/EUSOL--LOGO.png"
