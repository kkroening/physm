export default class Decal {
  xform(xform_matrix) {
    throw new Error('abstract method');
  }

  getDomElement(xform_matrix, { key }) {
    throw new Error('abstract method');
  }
}
