import { Nav } from './components/Nav'
import { Sheet } from './components/Sheet'
import { Toast } from './components/Toast'
import { StoreProvider, useStore } from './lib/store'
import { Home } from './pages/Home'
import { ErrorScreen, NoCode, Pick } from './pages/Join'
import { Meetings } from './pages/Meetings'
import { Schedule } from './pages/Schedule'
import { Us } from './pages/Us'

function Shell() {
  const { status, error, page, openSheet } = useStore()
  if (status === 'boot') return <div className="boot"><div className="spinner" /></div>
  if (status === 'nocode') return <NoCode />
  if (status === 'error') return <ErrorScreen message={error ?? ''} />
  if (status === 'pick') return <Pick />
  return (
    <div className="app">
      <Nav />
      <main className="main">
        {page === 'home' && <Home />}
        {page === 'sched' && <Schedule />}
        {page === 'meet' && <Meetings />}
        {page === 'us' && <Us />}
      </main>
      <button type="button" className="fab" aria-label="Добавить занятость" onClick={() => openSheet({ type: 'menu' })}>+</button>
      <Sheet />
      <Toast />
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
