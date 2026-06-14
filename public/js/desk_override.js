// ── Eusol Organics — Desk Override ──

frappe.ready(function() {

    // ── Browser tab title ──
    var origTitle = document.title;
    if (origTitle) {
        document.title = origTitle.replace('Frappe', 'Eusol Organics').replace('ERPNext', 'Eusol Organics');
    }

    // Override frappe.ui.set_title if available
    if (frappe && frappe.ui && frappe.ui.set_title) {
        var _origSetTitle = frappe.ui.set_title;
        frappe.ui.set_title = function(title, subtitle, merge) {
            _origSetTitle.call(this, title, subtitle, merge);
            document.title = document.title
                .replace(' - Frappe', ' — Eusol Organics')
                .replace(' - ERPNext', ' — Eusol Organics')
                .replace('Frappe', 'Eusol Organics')
                .replace('ERPNext', 'Eusol Organics');
        };
    }

    // ── Navbar logo replacement ──
    frappe.after_ajax(function() {
        // Replace navbar brand text if present
        var brandEls = document.querySelectorAll('.navbar-brand, .navbar-home');
        brandEls.forEach(function(el) {
            var img = el.querySelector('img');
            if (img && !img.src.includes('EUSOL')) {
                img.src    = '/files/EUSOL--LOGO.png';
                img.alt    = 'Eusol Organics';
                img.style.height = '28px';
                img.style.width  = 'auto';
                img.onerror = function() { this.style.display = 'none'; };
            }
        });

        // Replace "Guest" or username display with friendly name
        var userEl = document.querySelector('.navbar .user-name, .navbar .dropdown-toggle .user-name');
        if (userEl && frappe.session && frappe.session.user) {
            // keep as-is — ERPNext handles this
        }
    });

    // ── Add "Home" link to navbar pointing to /home ──
    frappe.after_ajax(function() {
        var navbar = document.querySelector('.navbar-nav');
        if (navbar && !document.getElementById('eusol-home-link')) {
            var li = document.createElement('li');
            li.className = 'nav-item';
            li.id = 'eusol-home-link';
            li.innerHTML = '<a class="nav-link" href="/home" style="color:rgba(255,255,255,0.75);font-size:13px;display:flex;align-items:center;gap:5px;"><span>🏠</span> Dashboard</a>';
            navbar.insertBefore(li, navbar.firstChild);
        }
    });

});
