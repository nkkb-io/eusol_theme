// sidebar_logo.js
// Moves the Desk navbar brand/logo into the top of the sidebar.
// Place in: your_app/public/js/sidebar_logo.js
// Register in hooks.py via app_include_js (see instructions).

frappe.after_ajax(() => {
  move_logo_to_sidebar();
});

// Also re-run on route change in case the sidebar re-renders
$(document).on('app_ready', move_logo_to_sidebar);

function move_logo_to_sidebar() {
  const $navbarBrand = $('.navbar-brand').first();
  const $sidebarHeader = $('.body-sidebar .sidebar-header').first();

  if (!$navbarBrand.length || !$sidebarHeader.length) return;

  // Avoid duplicating if this has already run
  if ($sidebarHeader.find('.eusol-sidebar-logo').length) return;

  // Clone the logo (img + text) rather than ripping the original node,
  // so the navbar's click-to-home behaviour elsewhere is undisturbed.
  const $logoClone = $navbarBrand.clone(true, true);
  $logoClone.addClass('eusol-sidebar-logo');

  // Insert at the very top of the sidebar header
  $sidebarHeader.prepend($logoClone);

  // Optionally hide the original navbar logo so it doesn't appear twice.
  // Comment this out if you'd rather keep it in both places.
  $navbarBrand.css('visibility', 'hidden');
}
