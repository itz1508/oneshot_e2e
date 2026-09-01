import '@testing-library/jest-dom/vitest'

// jsdom lacks ResizeObserver / matchMedia, which real shadcn/ui primitives
// (cmdk Command, radix) touch during render.
class ResizeObserverStub {
    observe() {
    }

    unobserve() {
    }

    disconnect() {
    }
}

if (!('ResizeObserver' in globalThis)) {
    Object.assign(globalThis, {ResizeObserver: ResizeObserverStub})
}

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {
    }
}

if (!window.matchMedia) {
    Object.assign(window, {
        matchMedia: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {
            },
            removeListener: () => {
            },
            addEventListener: () => {
            },
            removeEventListener: () => {
            },
            dispatchEvent: () => false,
        }),
    })
}
