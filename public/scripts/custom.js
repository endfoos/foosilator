/* global $ */
$(document).ready(function () {
  $('.js-toggle-menu').on('click', function (e) {
    e.preventDefault()
    $('.navigation').toggleClass('open')
    $(this).toggleClass('open')
  })

  $('.js-navigate-on-change').on('change', function () {
    window.location = $(this).val()
  })

  $('.js-activate-control').on('click', function (e) {
    e.preventDefault()
    var t = $(this)
    var target = $($(this).data('target'))
    t.toggleClass('activated')
    target.toggleClass('activated')
    if (t.hasClass('activated')) {
      t.data('text', t.html())
      t.html('Cancel')
    } else {
      t.html(t.data('text'))
    }
  })
})
