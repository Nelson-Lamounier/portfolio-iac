import '@testing-library/jest-dom'

// Polyfill for Next.js server environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;
