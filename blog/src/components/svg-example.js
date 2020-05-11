import React from 'react'
import { Component } from 'react'

export default class SvgExample extends Component {
  render() {
    return <div>
      <svg>
        <circle cx={50} cy={50} r={10} fill="red" />
      </svg>
    </div>
  }
}
