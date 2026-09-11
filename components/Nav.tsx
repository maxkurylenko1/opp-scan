import Link from "next/link";

export default function Nav() {
  return <nav className="nav"><div className="nav-inner"><Link className="brand" href="/">◉ Opp Scan</Link><div className="nav-links"><Link href="/">Opportunities</Link><Link href="/signals">Signals</Link><Link href="/runs">Runs</Link></div></div></nav>;
}
