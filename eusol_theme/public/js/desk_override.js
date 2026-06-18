// ── Eusol Organics — Desk Override ──
frappe.ready(function() {

    var BRAND_NAME = "Eusol Organics";

    var RENAME_MAP = [
        ["ERPNext Settings", "Configuration"],
        ["Frappe HR", "HR"],
        ["Frappe Framework", BRAND_NAME],
        ["ERPNext", BRAND_NAME],
        ["Frappe", BRAND_NAME]
    ];

    var SKIP_TAGS = ["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT"];

    function renameTextNodes(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
                var parentTag = node.parentNode && node.parentNode.tagName;
                if (parentTag && SKIP_TAGS.indexOf(parentTag) !== -1) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }, false);

        var node;
        var nodesToUpdate = [];
        while ((node = walker.nextNode())) {
            var text = node.nodeValue;
            if (!text || !text.trim()) continue;
            var newText = text;
            for (var i = 0; i < RENAME_MAP.length; i++) {
                var from = RENAME_MAP[i][0];
                var to = RENAME_MAP[i][1];
                if (newText.indexOf(from) !== -1) {
                    newText = newText.split(from).join(to);
                }
            }
            if (newText !== text) {
                nodesToUpdate.push([node, newText]);
            }
        }
        // Apply changes after walking, to avoid mutating the tree mid-walk
        nodesToUpdate.forEach(function(pair) {
            pair[0].nodeValue = pair[1];
        });
    }

    function runRename() {
        try {
            renameTextNodes(document.body);
        } catch (e) {
            // fail silently, never break the desk
        }
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
        var brandEls = document.querySelectorAll('.navbar-brand img, .navbar-home img, .sidebar-header img, .header-logo img');
        brandEls.forEach(function(img) {
            if (!img.src.includes('EUSOL')) {
                img.src    = '/files/EUSOL--LOGO.png';
                img.alt    = BRAND_NAME;
                img.onerror = function() { this.style.display = 'none'; };
            }
        });
    }

    // ── Debounced runner so we don't fight Frappe's own re-renders ──
    var debounceTimer = null;
    function scheduleRun() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
            runRename();
            replaceLogos();
        }, 400);
    }

    // Run on route change
    frappe.router.on('change', function() {
        scheduleRun();
    });

    // Run on initial load
    scheduleRun();

    // Watch for dynamic content, but debounced so it only fires once      
    // after the DOM settles, not on every single mutation
    var observer = new MutationObserver(function() {
        scheduleRun();
    });
    observer.observe(document.body, { childList: true, subtree: true });

});

   function fixHeaderSubtitle() {
        var subtitles = document.querySelectorAll('.header-subtitle');
            subtitles.forEach(function(el) {
        if (el.textContent.indexOf('ERPNext') !== -1) {
            el.textContent = el.textContent.replace('ERPNext', BRAND_NAME);
        }
    });
}
