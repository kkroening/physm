# Minimal jQuery cheatsheet

Because the internet is terrible, it's hard to find a concise overview of jQuery.  This document is an attempt to capture the most important aspects of jQuery without going off into the woods.

## DOM manipulation

Include jQuery:
```
<script src="https://code.jquery.com/jquery-1.11.3.min.js"></script>
```

Get DOM element selector by ID (selectors are the basic building block of jQuery that allow you to manipulate DOM elements):
```
<div id="example"></div>  (html)
var example = $("#example");
```

Append DOM element(s):
```
$("#example").append("<p>Example text!</p>");
```

Replace DOM element:
```
$("#example").html("<p>New example text!</p>");
```

Remove DOM element:
```
$("#example").remove();
```

Get edit-box input text:
```
<input type="text" id="example">
var exampleText = $("#example").val();
```


Add click handler to button:
```
<input type="button" id="doit" value="Do it!">
$("#doit").click(function() {
    console.log("Boom!");
});
```

Notice the general pattern:
- Create a selector using $("#someid")
- Do something with that selector by calling a function on it, e.g. .val(). The function name is usually pretty close to what you're trying to do (such as getting the value, appending, removing, etc.).

## Other

Run code on document load:
```
$(function() {
    console.log("Document loaded!");
});
```

## Summary

That's the gist of jQuery.  Of course there are more complicated things you can do with it, but this pattern covers 90% of all the jQuery you'll ever need to do.

