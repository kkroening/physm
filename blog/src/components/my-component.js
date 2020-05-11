import * as THREE from 'three'
import React from 'react'
import {Component} from 'react'

export default class MyComponent extends Component {
  componentDidMount() {
    const width = this.mount.clientWidth
    const height = this.mount.clientHeight
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    this.camera.position.z = 4
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor('#000000')
    this.renderer.setSize(width, height)
    this.mount.appendChild(this.renderer.domElement)
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: '#433F81' })
    this.cube = new THREE.Mesh(geometry, material)
    this.scene.add(this.cube)
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.animate.bind(this))
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId)
    this.mount.removeChild(this.renderer.domElement)
  }

  animate() {
    this.cube.rotation.x += 0.01
    this.cube.rotation.y += 0.01
    this.renderScene()
    this.frameId = window.requestAnimationFrame(this.animate.bind(this))
  }

  renderScene() {
    this.renderer.render(this.scene, this.camera)
  }

  render() {
    return (
      <div
        style={{ width: '400px', height: '400px' }}
        ref={mount => {
          this.mount = mount
        }}
      />
    )
  }
}
