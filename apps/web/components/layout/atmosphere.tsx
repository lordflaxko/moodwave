/**
 * The cinematic backdrop: two very slow light leaks tinted by the current mood, a
 * vignette, and grain (applied on <body>). Deliberately dim; content brings the colour.
 */
export function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-[35%] left-[-10%] h-[80vh] w-[80vh] animate-drift rounded-full bg-[var(--mood-a)] opacity-[0.14] blur-[140px] transition-colors duration-[2000ms]" />
      <div className="absolute top-[20%] right-[-20%] h-[70vh] w-[70vh] animate-drift rounded-full bg-[var(--mood-b)] opacity-[0.08] blur-[150px] transition-colors duration-[2000ms] [animation-delay:-11s]" />
      <div className="absolute inset-x-0 bottom-0 h-[40vh] bg-[radial-gradient(ellipse_at_bottom,rgb(232_184_107/0.05),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_30%,transparent_55%,rgb(5_4_7/0.75))]" />
    </div>
  );
}
