import { render } from '@testing-library/react';
import App from './App';
import type { RsWasmModule } from './RsSolver';

let rsWasmModule: RsWasmModule | null = null;

beforeAll(async () => {
  // TODO: find a better way to load physm-rs.
  rsWasmModule = await import('../../physm-rs/nodepkg/physm_rs.js');
});

describe('App component', () => {
  test('renders stuff', () => {
    const { getByText } = render(<App rsWasmModule={rsWasmModule} />);
    const element = getByText(/Cart, Poles/);
    expect(element).toBeInTheDocument();
  });
});
