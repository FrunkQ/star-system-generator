// ASK THE BROWSER WHETHER IT IS ACTUALLY GOING TO USE THE GPU, AND BELIEVE THE ANSWER.
//
// C20, job 2. The owner's report is a hang: *"a total lockup. SSE can't be given the memory it
// needs. (It will eventually work... Kill it!) MS Edge seems particularly prone to this."* The
// phrase that names the cause is IT WILL EVENTUALLY WORK. A scene that eventually finishes is not
// out of memory - it is being drawn correctly, one fragment at a time, ON THE PROCESSOR.
//
// A Chromium browser under memory pressure, or with a GPU process that has already fallen over,
// does not refuse to give you WebGL. It hands back a context backed by SwiftShader, its software
// rasteriser, and says nothing. Every call succeeds. The picture is right. It is simply a hundred
// times slower, and a full holo scene driven through it is exactly the lockup he describes - which
// is also why a fresh browser purrs, and why Edge (which shares a GPU process across a great many
// tabs) is the worst offender.
//
// `failIfMajorPerformanceCaveat` is the one question that distinguishes the two. It is the WebGL
// specification's way of saying "only give me this context if it is not going to be terrible", and
// with it set the browser returns NULL rather than a software context.
//
// WHY THIS IS A SEPARATE THROWAWAY CONTEXT AND NOT A FLAG ON THE REAL ONE (engine map RENDER-S57):
// the flag reports by REFUSING, and a refusal on a real surface is a null context, which is a dead
// view. Steer, don't stop - so the question is asked once, on a 1x1 canvas that is thrown away
// immediately, and the answer is remembered for the session.

/** What this machine is actually going to draw with. */
export type RenderPath =
	/** A real GPU, or at least a context the browser is not embarrassed by. */
	| 'gpu'
	/** WebGL works, but only because the browser fell back to drawing on the CPU. */
	| 'software'
	/** No WebGL at all. The 3D views cannot run here whatever we do. */
	| 'none';

/** Matches what `createGlRenderer` really asks for, so the probe measures the context we then use. */
const PROBE_ATTRS: WebGLContextAttributes = { powerPreference: 'high-performance' };

/**
 * The sentence a GM reads. It lives here, once, beside the measurement that earns it.
 *
 * WHAT MAKES IT WORTH SHOWING is the last clause. "Your browser is slow" is a complaint; a sentence
 * that says what happened, what we did about it and what they can do next is a way out of a hang,
 * and it is the owner's own workaround written down where the person who needs it will see it.
 */
export function renderPathNotice(path: RenderPath): string | null {
	if (path === 'software')
		return (
			'This browser is drawing 3D with the processor instead of the graphics chip, which is very slow. ' +
			'Low power is on to keep it usable. Closing some tabs, or opening SSE in a fresh browser window, will be much faster.'
		);
	if (path === 'none')
		return (
			'This browser cannot draw 3D at all, so the 3D views will be blank. ' +
			'A fresh browser window usually restores it; if it does not, check that hardware acceleration is switched on.'
		);
	return null;
}

function attempt(strict: boolean): WebGLRenderingContext | WebGL2RenderingContext | null {
	// A FRESH CANVAS EACH TIME, deliberately. Once a canvas has a context of a given type, every later
	// `getContext` for that type returns THAT context and silently ignores the attributes - so asking
	// the second question on the first canvas would be asking nothing at all.
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const attrs = strict ? { ...PROBE_ATTRS, failIfMajorPerformanceCaveat: true } : PROBE_ATTRS;
	return (canvas.getContext('webgl2', attrs) ??
		canvas.getContext('webgl', attrs)) as WebGLRenderingContext | WebGL2RenderingContext | null;
}

function release(ctx: WebGLRenderingContext | WebGL2RenderingContext): void {
	// Hand the context back at once rather than waiting for a collection that may never come. The
	// probe costing us one of the browser's handful of live contexts would be a small version of the
	// very fault job 3 is about.
	try {
		ctx.getExtension('WEBGL_lose_context')?.loseContext();
	} catch {
		/* an extension a browser does not offer is not a failure worth reporting */
	}
}

function measure(): RenderPath {
	// Server-side there is nothing to draw and no machine to slander.
	if (typeof document === 'undefined') return 'gpu';
	try {
		const strict = attempt(true);
		if (strict) {
			release(strict);
			return 'gpu';
		}
		// Refused. Either it would be software-rendered, or there is no WebGL here at all - and those
		// are different sentences, so ask again without the condition to find out which.
		const loose = attempt(false);
		if (loose) {
			release(loose);
			return 'software';
		}
		return 'none';
	} catch {
		// A MACHINE WE CANNOT ASK ABOUT IS ASSUMED TO BE A NORMAL ONE. That is the rule `lowPowerStore`
		// already states for its own failed reads, and it is the right way round: the cost of being
		// wrong here is stripping the clouds off somebody's perfectly good machine and telling them
		// their browser is broken.
		return 'gpu';
	}
}

let cached: RenderPath | null = null;

/**
 * What this machine draws with. Measured on the first call and remembered for the session.
 *
 * ONCE IS DELIBERATE, not just an optimisation. Every call creates and destroys a real WebGL
 * context, and a browser that is already short of them is precisely the machine this exists to
 * detect - asking repeatedly would make the condition it reports slightly worse each time.
 */
export function renderPath(): RenderPath {
	if (cached === null) cached = measure();
	return cached;
}

/** Tests only: forget the measurement so the next call re-measures. */
export function resetRenderPathForTests(): void {
	cached = null;
}
