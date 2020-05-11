# Kralnet Blog

This repo contains the source code for the [kralnet.us](https://kralnet.us) blog.

It's written in [Gatsby](https://www.gatsbyjs.org/), following the [official tutorial](https://www.gatsbyjs.org/tutorial/) steps with some modifications along the way.

It's currenlty meant to be a starting point for a blog as a proof of concept demonstrating the following:
- Blog posts primarily written in markdown
- Custom React components using libraries such as Three.js, embeddable via JSX within blog markdown
- Custom layout and page navigation with full JS/React capability
- Customizable theme (e.g. using Typography)
- Hosting through Firebase
- Collection of analytics data using Google Analytics

More will of  course be filled in later, but for now it takes care of the hard/annoying parts so that the focus can be more on creativity than just getting something off the ground.

## Local development

### Optional: install specific node version using nvm

Follow the nvm installation instructions from the [official nvm readme](https://www.gatsbyjs.org/tutorial/).  In particular:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
```

Then install the particular version of node that this project uses:
```bash
nvm install
```

Note that this looks at the node version specified in [`.nvmrc`](https://github.com/kkroening/blog/blob/master/.nvmrc).

### Setup npm dependencies

```bash
npm install
```

Note that all of the required command-line tools (e.g. `gatsby`) are installed into the `node_modules` rather than requiring you to do `npm install -g whatever`, as a general practice to ensure that a particular version of the command-line tools is used (rather than whatever happens to be installed globally; TODO: write a blog post about how `npm install -g` is cancerously bad and should basically never be used, even though tons of people across the internet use it).

### Run development server

Run the development server with the `develop` npm script:
```bash
npm run develop
```

Note that this handy script is actually defined in the [`scripts` section of `package.json`](https://github.com/kkroening/blog/blob/0f58dafba6d5105073ab41aebc9a892d42d1a61a/package.json#L8), and simply calls `gatsby develop`.

## Deployment

Make sure you have access to the `kralnet` firebase project or modify [`.firebaserc`](https://github.com/kkroening/blog/blob/0f58dafba6d5105073ab41aebc9a892d42d1a61a/.firebaserc) with the desired project ID.  Then run the following to perform deployment:

```bash
npm run deploy
```

If all goes well, your latest code should be serving in Firebase, and the release should appear in the _Hosting_ section of the [Firebase console](https://console.firebase.google.com/).

TODO: write instructions on how to set up your own firebase project.
