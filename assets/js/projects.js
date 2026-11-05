// ARC portfolio - project detail dialogs
(function () {
  'use strict';

  var root = document.documentElement;
  var openers = document.querySelectorAll('[data-dialog]');

  openers.forEach(function (button) {
    var dialog = document.getElementById(button.getAttribute('data-dialog'));
    if (!dialog) { return; }

    var closeButton = dialog.querySelector('.project-dialog__close');

    function openDialog() {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      root.classList.add('modal-open');
    }

    // Enter is blocked inside the dialog, except on buttons.
    // Buttons need Enter so keyboard users can press the close button.
    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.target.closest('button')) {
        event.preventDefault();
      }
    });

    function closeDialog() {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      root.classList.remove('modal-open');
    }

    button.addEventListener('click', openDialog);
    if (closeButton) { closeButton.addEventListener('click', closeDialog); }

    // Clicking the dark area outside the box closes the dialog
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) { closeDialog(); }
    });

    // The Esc key closes a dialog by itself. This keeps the page scroll in sync.
    dialog.addEventListener('close', function () {
      root.classList.remove('modal-open');
    });
  });
})();

// Project screenshot lightbox
(function () {
  'use strict';

  var lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  var image = lightbox.querySelector('.lightbox__img');
  var caption = lightbox.querySelector('.lightbox__caption');
  var closeButton = lightbox.querySelector('.lightbox__close');
  var openers = document.querySelectorAll('[data-lightbox]');

  function closeLightbox() {
    if (typeof lightbox.close === 'function' && lightbox.open) {
      lightbox.close();
    } else {
      lightbox.removeAttribute('open');
    }
    document.documentElement.classList.remove('modal-open');
  }

  openers.forEach(function (button) {
    button.addEventListener('click', function () {
      var thumbnail = button.querySelector('img');
      if (!thumbnail) return;

      image.src = thumbnail.src;
      image.alt = thumbnail.alt;
      caption.textContent = thumbnail.alt;

      if (typeof lightbox.showModal === 'function') {
        lightbox.showModal();
      } else {
        lightbox.setAttribute('open', '');
      }

      document.documentElement.classList.add('modal-open');
    });
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeLightbox);
  }

  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  lightbox.addEventListener('close', function () {
    document.documentElement.classList.remove('modal-open');
  });
})();