import React from 'react'
import {graphql} from 'gatsby'
import {Link} from 'gatsby'
import Header from '../components/header'
import Layout from '../components/layout'

const PostLink = ({post}) => (
  <div>
    <Link to={post.frontmatter.path}>
      {post.frontmatter.title} ({post.frontmatter.date})
    </Link>
  </div>
)

export default ({data: {allMarkdownRemark: {edges}}}) => {
  const postLinks = edges
    .map(edge => <PostLink key={edge.node.id} post={edge.node} />)
  return <Layout>
    <div style={{ color: `teal` }}>
      <Header text='Blog List'></Header>
      <Link to='/'>Home</Link>
      <p>Congratulations - you made it.</p>
      {postLinks}
    </div>
  </Layout>
}

export const pageQuery = graphql`
  query {
    allMarkdownRemark(sort: {order: DESC, fields: [frontmatter___date]}) {
      edges {
        node {
          id
          excerpt(pruneLength: 250)
          frontmatter {
            date(formatString: "MMMM DD, YYYY")
            path
            title
          }
        }
      }
    }
  }
`
