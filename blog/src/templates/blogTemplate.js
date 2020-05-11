import Layout from '../components/layout'
import MyComponent from '../components/my-component'
import React from 'react'
import rehypeReact from 'rehype-react'
import {graphql} from 'gatsby'

const renderAst = new rehypeReact({
  createElement: React.createElement,
  components: { 'my-component': MyComponent }
}).Compiler

export default function Template({
  data,
}) {
  const { markdownRemark } = data
  const { frontmatter, htmlAst } = markdownRemark
  return (
    <Layout>
      <div className='blog-post-container'>
        <div className='blog-post'>
          <h1>{frontmatter.title}</h1>
          <h3>Date: {frontmatter.date}</h3>
          <div>{renderAst(htmlAst)}</div>
        </div>
      </div>
    </Layout>
  )
}

export const pageQuery = graphql`
  query($path: String!) {
    markdownRemark(frontmatter: { path: { eq: $path } }) {
      htmlAst
      frontmatter {
        date(formatString: "MMMM DD, YYYY")
        path
        title
      }
    }
  }
`
