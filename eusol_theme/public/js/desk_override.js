// ── Eusol Organics — Desk Override ──
frappe.ready(function() {

    var BRAND_NAME = "Eusol Organics";

    var RENAME_MAP = {
        "ERPNext Settings": "Configuration",
        "Frappe HR": "HR",
        "Frappe Framework": BRAND_NAME,
        "ERPNext": BRAND_NAME,
        "Frappe": BRAND_NAME
    };

    function renameTextNodes(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            var text = node.nodeValue;
            if (!text || !text.trim()) continue;
            for (var key in RENAME_MAP) {
                if (text.indexOf(key) !== -1) {
                    node.nodeValue = text.split(key).join(RENAME_MAP[key]);
                }
            }
        }
    }

    function runRename() {
        renameTextNodes(document.body);
    }

    // ── Browser tab title ──
    var origTitle = document.title;
    if (origTitle) {
        document.title = origTitle.replace('Frappe', BRAND_NAME).replace('ERPNext', BRAND_NAME);
    }
    if (frappe && frappe.ui && frappe.ui.set_title) {
        var _origSetTitle = frappe.ui.set_title;
        frappe.ui.set_title = function(title, subtitle, merge) {
            _origSetTitle.call(this, title, subtitle, merge);
            document.title = document.title
                .replace(' - Frappe', ' — ' + BRAND_NAME)
                .replace(' - ERPNext', ' — ' + BRAND_NAME)
                .replace('Frappe', BRAND_NAME)
                .replace('ERPNext', BRAND_NAME);
        };
    }

    // ── Navbar / sidebar logo replacement ──
    function replaceLogos() {
        var brandEls = document.querySelectorAll('.navbar-brand, .navbar-home, .sidebar-header img, .header-logo img');
        brandEls.forEach(function(img) {
            if (img.tagName === 'IMG' && !img.src.includes('EUSOL')) {
                img.src    = '/files/EUSOL--LOGO.png';
                img.alt    = BRAND_NAME;
                img.onerror = function() { this.style.display = 'none'; };
            }
        });
    }

    // Run rename + logo replace on every route change (desk is a SPA)
    frappe.router.on('change', function() {
        setTimeout(function() { runRename(); replaceLogos(); }, 150);
        setTimeout(function() { runRename(); replaceLogos(); }, 600);
    });

    // Run on initial load too
    setTimeout(function() { runRename(); replaceLogos(); }, 300);
    setTimeout(function() { runRename(); replaceLogos(); }, 1000);

    // Catch dynamically rendered content (module cards, sidebar, dialogs, "About" popup etc.)
    var observer = new MutationObserver(function() {
        runRename();
    });
    observer.observe(document.body, { childList: true, subtree: true });

});
