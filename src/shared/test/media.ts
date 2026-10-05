/**
 * jsdom has no media playback. This stub gives every `<video>` a working play/pause, seekable `currentTime`, volume,
 * mute and rate, firing the same events a browser would, so player behavior can be tested.
 */
type MediaState = {
    paused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    playbackRate: number;
    defaultPlaybackRate: number;
};

const states = new WeakMap<HTMLMediaElement, MediaState>();

function stateOf(element: HTMLMediaElement): MediaState {
    let state = states.get(element);
    if (!state) {
        state = {
            paused: true,
            currentTime: 0,
            duration: Number.NaN,
            volume: 1,
            muted: false,
            playbackRate: 1,
            defaultPlaybackRate: 1,
        };
        states.set(element, state);
    }
    return state;
}

function emit(element: HTMLMediaElement, type: string) {
    element.dispatchEvent(new Event(type));
}

function writable<K extends keyof MediaState>(key: K, event?: string): PropertyDescriptor {
    return {
        configurable: true,
        get(this: HTMLMediaElement) {
            return stateOf(this)[key];
        },
        set(this: HTMLMediaElement, value: MediaState[K]) {
            stateOf(this)[key] = value;
            if (event) {
                emit(this, event);
            }
        },
    };
}

export function installMediaElementStub() {
    Object.defineProperties(HTMLMediaElement.prototype, {
        paused: {
            configurable: true,
            get(this: HTMLMediaElement) {
                return stateOf(this).paused;
            },
        },
        duration: {
            configurable: true,
            get(this: HTMLMediaElement) {
                return stateOf(this).duration;
            },
        },
        currentTime: writable("currentTime", "timeupdate"),
        volume: writable("volume", "volumechange"),
        muted: writable("muted", "volumechange"),
        playbackRate: writable("playbackRate", "ratechange"),
        defaultPlaybackRate: writable("defaultPlaybackRate"),
        play: {
            configurable: true,
            value(this: HTMLMediaElement) {
                stateOf(this).paused = false;
                emit(this, "play");
                return Promise.resolve();
            },
        },
        pause: {
            configurable: true,
            value(this: HTMLMediaElement) {
                stateOf(this).paused = true;
                emit(this, "pause");
            },
        },
        load: { configurable: true, value() {} },
    });
}

/** Simulates the browser reading the file header. */
export function loadMetadata(element: HTMLMediaElement, durationSeconds: number) {
    stateOf(element).duration = durationSeconds;
    emit(element, "durationchange");
    emit(element, "loadedmetadata");
}

/** Simulates playback reaching the end. */
export function playToEnd(element: HTMLMediaElement) {
    const state = stateOf(element);
    state.currentTime = state.duration;
    state.paused = true;
    emit(element, "timeupdate");
    emit(element, "pause");
    emit(element, "ended");
}
