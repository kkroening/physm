module.exports = {
  siteMetadata: {
    title: 'Kralnet',
  },
  plugins: [
    {
      resolve: 'gatsby-plugin-typography',
      options: {
        pathToConfigModule: 'src/utils/typography',
      },
    },
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        path: `${__dirname}/src/md`,
        name: 'markdown-pages',
      }
    },
    {
      resolve: 'gatsby-plugin-google-analytics',
      options: {
        trackidId: 'UA-139607511-1',
      },
    },
    'gatsby-transformer-remark',
  ],
}
