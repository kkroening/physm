import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

let wasm = null;

beforeAll(async () => {
  // TODO: find a better way to load physm-rs.
  wasm = await import('../../physm-rs/nodepkg/physm_rs.js');
});

describe('App component', () => {
  test('renders stuff', () => {
    const { getByText } = render(<App wasm={wasm} />);
    const element = getByText(/CartPoi/);
    expect(element).toBeInTheDocument();
  });
});
