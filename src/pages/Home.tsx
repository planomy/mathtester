import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="page home">
      <header className="brand-block">
        <p className="eyebrow">Planomy</p>
        <h1>MathTester</h1>
        <p className="lede">
          Handwritten maths tests with room to show working — stylus, mouse, or finger.
        </p>
      </header>

      <div className="home-actions">
        <Link className="btn primary" to="/teacher">
          Teacher panel
        </Link>
        <Link className="btn ghost" to="/join">
          Student join
        </Link>
      </div>

      <section className="home-note">
        <h2>Why it exists</h2>
        <p>
          Typed answers hide how students got there. MathTester captures authentic working on a
          paper-like canvas, then submits a full-test PDF to the teacher.
        </p>
      </section>
    </div>
  )
}
