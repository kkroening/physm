var page = require('webpage').create();
page.viewportSize = { width: 640, height: 480 };

//page.open('http://www.goodboydigital.com/pixijs/examples/12-2/', function () {
page.open('http://localhost:8070', function () {
  setInterval(function() {
    page.render('/dev/stdout', { format: "png" });
  }, 25);
});
