const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

module.exports = function (hbs) {
  // Formats a JS date object as 2 Mar 2015 21:04
  hbs.registerHelper('formatDate', function (d) {
    // Add a leading 0 to minutes
    let minutes = d.getMinutes()
    minutes = minutes.toString().length >= 2 ? minutes : '0' + minutes
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${minutes}`
  })

  // If two arguments are equal...
  hbs.registerHelper('ifEq', function (x, y, options) {
    if (x === y) {
      return options.fn(this)
    } else {
      return options.inverse(this)
    }
  })
}
