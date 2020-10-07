import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('renders stuff', () => {
  const { getByText } = render(<App />);
  const element = getByText(/This is a plot./);
  expect(element).toBeInTheDocument();
});
