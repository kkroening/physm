import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

describe('App component', () => {
  test('renders stuff', () => {
    const { getByText } = render(<App />);
    const element = getByText(/Smashteroids/);
    expect(element).toBeInTheDocument();
  });
});
