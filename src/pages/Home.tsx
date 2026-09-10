import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="page home">
      <header className="brand-block">
        <p className="eyebrow">Planomy</p>
        <h1>TestPro</h1>
        <p className="lede">
          Handwritten tests with room to show working — lock graphs and sources, then write over them.
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
          Typed answers hide how students got there. TestPro captures authentic working on a
          paper-like canvas — including over locked images or PDF pages — then submits a full-test
          PDF to the teacher.
        </p>
      </section>
    </div>
  )
}
