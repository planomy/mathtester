import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="page home">
      <header className="brand-block">
        <p className="eyebrow">Planomy</p>
        <h1>TestPro</h1>
      </header>

      <div className="home-actions">
        <Link className="btn primary" to="/teacher">
          Teacher panel
        </Link>
        <Link className="btn ghost" to="/join">
          Student join
        </Link>
      </div>
    </div>
  )
}
