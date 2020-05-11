import _ from 'lodash';
import * as THREE from 'three';


const GRAVITY = 10.;
const BALL_RADIUS = 0.5;
const CART_WIDTH = 1.;
const CART_HEIGHT = 0.5;


class Line {
  /** A less shitty interface to drawing lines in threejs.  Mostly a science experiment.
   */
  constructor(x1, y1, x2, y2, material, z) {
    z = z || 0.0;
    this.positions = new Float32Array(2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.addAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.positions[2] = z;
    this.positions[5] = z;
    this.setValues(x1, y1, x2, y2);
    this.obj = new THREE.Line(this.geometry, material);
  }

  setDirty() {
    this.geometry.attributes.position.needsUpdate = true;
  }

  getVertex(i) {
    return [this.positions[3*i], this.positions[3*i + 1]];
  }

  setVertex(i, x, y) {
    this.positions[3*i] = x;
    this.positions[3*i + 1] = y;
    this.setDirty();
  }

  getValues() {
    const [x1, y1] = this.getVertex(0);
    const [x2, y2] = this.getVertex(1);
    return [x1, y1, x2, y2];
  }

  setValues(x1, y1, x2, y2) {
    this.setVertex(0, x1, y1);
    this.setVertex(1, x2, y2);
  }

  get x1() {
    return this.positions[0];
  }

  set x1(value) {
    //console.log(`${this.x1}, ${this.y1}, ${this.x2}, ${this.y2}`);
    this.positions[0] = value;
    this.setDirty();
  }

  get y1() {
    return this.positions[1];
  }

  set y1(value) {
    this.positions[1] = value;
    this.setDirty();
  }

  get x2() {
    return this.positions[3];
  }

  set x2(value) {
    this.positions[3] = value;
    this.setDirty();
  }

  get y2() {
    return this.positions[4];
  }

  set y2(value) {
    this.positions[4] = value;
    this.setDirty();
  }
}


const initCamera = () => {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.z = 10;
  return camera;
};

const initRenderer = () => {
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setClearColor(0xffffffff);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  return renderer
};

const initScene = () => {
  return new THREE.Scene();
};

const initSceneObjs = (scene) => {
  const material = new THREE.MeshBasicMaterial({color: 0x000000});
  const trackMaterial = new THREE.LineBasicMaterial({color: 0x000000});
  const track = new Line(-100., 0., 100., 0., trackMaterial, -1.);
  scene.add(track.obj);

  const line = new Line(-10.0, 0.0, 0.0, 10.0, material);
  scene.add(line.obj);

  const cartGeometry = new THREE.PlaneGeometry(CART_WIDTH, CART_HEIGHT);
  const cart = new THREE.Mesh(cartGeometry, material);
  scene.add(cart);

  const ballGeometry = new THREE.CircleGeometry(BALL_RADIUS, 32);
  const ball = new THREE.Mesh(ballGeometry, material);
  scene.add(ball);

  const center = new Line(0., -100., 0., 100., trackMaterial, -1.);
  scene.add(center.obj);

  return {
    ball: ball,
    cart: cart,
    line: line,
  };
};

const init = () => {
  const camera = initCamera();
  const renderer = initRenderer();
  const scene = initScene();
  const sceneObjs = initSceneObjs(scene);
  return {
    camera: camera,
    renderer: renderer,
    scene: scene,
    sceneObjs: sceneObjs,
  };
}

const updateCartObj = (cartObj, mass, cart_x) => {
  const area = CART_WIDTH * CART_HEIGHT
  const size = Math.sqrt(1/area * mass);
  cartObj.position.x = cart_x;
  cartObj.position.y = 0.;
  cartObj.scale.set(size, size, size);
};

const calcBallPosition = (length, cart_x, theta) => {
  const x = cart_x + length * Math.sin(theta);
  const y = length * -Math.cos(theta);
  return [x, y];
};

const updateBallObj = (ballObj, mass, length, cart_x, theta) => {
  const size = Math.sqrt(mass);
  const radius = BALL_RADIUS * size
  const pos = ballObj.position;
  [pos.x, pos.y] = calcBallPosition(length, cart_x, theta);
  ballObj.scale.set(size, size, size);
};

const updateLine = (lineObj, length, cart_x, theta) => {
  lineObj.x1 = cart_x;
  [lineObj.x2, lineObj.y2] = calcBallPosition(length, cart_x, theta);
};

const update = (sceneObjs, params, state) => {
  updateCartObj(sceneObjs.cart, params.cart_mass, state.cart_x);
  updateBallObj(sceneObjs.ball, params.ball_mass, params.length, state.cart_x, state.theta);
  updateLine(sceneObjs.line, params.length, state.cart_x, state.theta);
};


const simulate = (params, state, dt) => {
  const ballMass = params.ball_mass;
  const cartMass = params.cart_mass;
  const cartMassRatio = cartMass / (ballMass + cartMass);
  const ballMassRatio = ballMass / (ballMass + cartMass);
  const length = params.length;

  const theta = state.theta;
  const dtheta = state.dtheta;
  const cart_dx = state.cart_dx;

  const d2theta_n = (
      (cartMassRatio - 1) * (dtheta * dtheta)
      - GRAVITY / (ballMass * length * Math.cos(theta))
  );
  const d2theta_d = cartMassRatio / Math.tan(theta) + Math.tan(theta);
  const d2theta = d2theta_n / d2theta_d;
  const cart_d2x = - ballMassRatio * length * (d2theta * Math.cos(theta) - (dtheta * dtheta) * Math.sin(theta));

  let newState = {...state};
  newState.time += dt;
  newState.dtheta += d2theta * dt;
  newState.theta += dtheta * dt;
  newState.cart_d2x = cart_d2x;
  newState.cart_dx += cart_d2x * dt;
  newState.cart_x += cart_dx * dt;
  return newState;
};

const simulateIteratively = (params, state, dt) => {
  const endTime = state.time + dt;
  while (endTime > state.time) {
    state = simulate(params, state, params.dt);
  }
  return state;
};

const main = () => {
  let params = {
    dt: 0.01,
    length: 3.,
    cart_mass: 1.,
    ball_mass: 1.,
  };

  let state = {
    time: 0.,
    theta: 2.0,
    dtheta: 0.,
    cart_x: 0.,
    cart_dx: 0.,
  };

  const {scene, camera, sceneObjs, renderer} = init();

  let cursorX;
  let cursorY;

  document.onmousemove = (event) => {
      cursorX = event.pageX / window.innerWidth * 2 - 1;
      cursorY = event.pageY / window.innerHeight * 2 - 1;
  }

  let date = new Date();

  const render = () => {
    const newDate = new Date();
    const dt = (newDate - date) / 1000.;
    date = newDate;
    state = simulateIteratively(params, state, dt);

    requestAnimationFrame(render);

    if (!!cursorX) {
      state.cart_dx = cursorX * 50.;
    }
    update(sceneObjs, params, state);

    renderer.render(scene, camera);
  };
  render();
};

main();
