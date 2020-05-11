import Header from '../components/header'
import Layout from '../components/layout'
import React from 'react'
import { graphql } from 'gatsby'

export default ({data}) => (
  <Layout>
    <div style={{ color: `teal` }}>
      <Header text='Home'/>
      <p>Welcome to {data.site.siteMetadata.title}</p>
    </div>
  </Layout>
)

export const query = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
  }
`
