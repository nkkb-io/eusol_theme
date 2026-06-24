// ── Eusol Organics — Desk Override ──
(function() {
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
        try {
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
            nodesToUpdate.forEach(function(pair) {
                pair[0].nodeValue = pair[1];
            });
        } catch(e) {}
    }

    function fixHeaderSubtitle() {
        try {
            var subtitles = document.querySelectorAll('.header-subtitle');
            subtitles.forEach(function(el) {
                RENAME_MAP.forEach(function(pair) {
                    if (el.textContent.indexOf(pair[0]) !== -1) {
                        el.textContent = el.textContent.split(pair[0]).join(pair[1]);
                    }
                });
            });
        } catch(e) {}
    }

    function runRename() {
        renameTextNodes(document.body);
        fixHeaderSubtitle();
    }

    function updateTitle() {
        try {
            var title = document.title;
            RENAME_MAP.forEach(function(pair) {
                title = title.split(pair[0]).join(pair[1]);
            });
            document.title = title;
        } catch(e) {}
    }

    var debounceTimer = null;
    function scheduleRun() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
            runRename();
            updateTitle();
        }, 400);
    }

    function scheduleFullRun() {
        [400, 800, 1500, 3000].forEach(function(delay) {
            setTimeout(function() {
                runRename();
                updateTitle();
            }, delay);
        });
    }

    // Hook into frappe router if available
    function setupHooks() {
        if (typeof frappe !== 'undefined' && frappe.router) {
            frappe.router.on('change', function() {
                scheduleFullRun();
            });
        }
        scheduleFullRun();
    }

    var observer = new MutationObserver(function() {
        scheduleRun();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, { childList: true, subtree: true });
            setupHooks();
        });
    } else {
        observer.observe(document.body, { childList: true, subtree: true });
        setupHooks();
    }

})();
