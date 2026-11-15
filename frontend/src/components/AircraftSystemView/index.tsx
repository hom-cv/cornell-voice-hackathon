import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ataLabel, findAta } from '@/data/ata'
import styles from './AircraftSystemView.module.css'

export default function AircraftSystemView({ area }: { area: string }) {
  const host = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const reset = useRef<() => void>(() => {})
  const [unavailable, setUnavailable] = useState(false)
  const chapter = findAta(area)

  useEffect(() => {
    const container = host.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch { queueMicrotask(() => setUnavailable(true)); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.setAttribute('aria-label', 'Interactive aircraft system model. Drag to rotate; scroll to zoom.')
    renderer.domElement.setAttribute('role', 'img')
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 10
    controls.maxDistance = 24
    controls.maxPolarAngle = Math.PI * 0.85
    scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x61717c, 2.7))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(4, 9, 7); scene.add(light)
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    function part(geometry: THREE.BufferGeometry, position: number[], scale: number[], codes: string[] = [], color = 0xdce5ec) {
      const active = chapter && codes.includes(chapter.code)
      const material = new THREE.MeshStandardMaterial({ color: active ? 0x22b6bd : color, roughness: 0.45, metalness: 0.25, emissive: active ? 0x08454a : 0x000000, emissiveIntensity: 0.3 })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2])
      scene.add(mesh); geometries.push(geometry); materials.push(material); return mesh
    }
    part(new THREE.SphereGeometry(1, 48, 32), [0, 0.25, 0], [0.58, 0.62, 4.25], ['11', '21', '25', '35', '38', '51', '53'])
    // Wing and tail surfaces are tapered solids, not flat image planes.
    function surface(points: number[][], y: number, codes: string[]) {
      const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)))
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.025, bevelSegments: 1, steps: 1 })
      const mesh = part(geometry, [0, y, 0], [1, 1, 1], codes); mesh.rotation.x = Math.PI / 2
    }
    for (const side of [-1, 1]) {
      surface([[side * 0.3, 1.2], [side * 4.8, -0.9], [side * 4.9, -1.5], [side * 0.35, -1.05]], 0.1, ['28', '30', '57'])
      surface([[side * 0.4, -0.55], [side * 4.5, -1.25], [side * 4.5, -1.5], [side * 0.4, -1.2]], 0.14, ['27'])
      surface([[side * 0.15, -2.5], [side * 1.9, -3.5], [side * 1.9, -3.9], [side * 0.15, -3.5]], 0.5, ['27', '55'])
      const engine = part(new THREE.CylinderGeometry(0.33, 0.3, 1.15, 32), [side * 1.6, -0.35, 0.3], [1, 1, 1], ['26', '36', '54', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80']); engine.rotation.x = Math.PI / 2
      const inlet = part(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 24), [side * 1.6, -0.35, 0.89], [1, 1, 1], [], 0x344953); inlet.rotation.x = Math.PI / 2
      part(new THREE.BoxGeometry(0.1, 0.6, 0.1), [side * 0.8, -0.55, -0.4], [1, 1, 1], ['32'], 0x667c8b)
      const wheel = part(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 20), [side * 0.8, -0.85, -0.4], [1, 1, 1], ['32'], 0x2a3742); wheel.rotation.z = Math.PI / 2
      part(new THREE.SphereGeometry(0.1, 16, 12), [side * 1.1, 0.16, 0.65], [1, 0.6, 1], ['33'], 0xffd87a)
      for (let z = -2.2; z <= 2.4; z += 0.28) part(new THREE.SphereGeometry(0.055, 8, 8), [side * 0.53, 0.5, z], [0.4, 1, 1], ['56'], 0x476879)
    }
    const finShape = new THREE.Shape([new THREE.Vector2(-3.7, 0.4), new THREE.Vector2(-3.5, 2.1), new THREE.Vector2(-2.3, 0.5)])
    const fin = part(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false }), [-0.04, 0, 0], [1, 1, 1], ['27', '55'], 0x287780)
    fin.rotation.y = -Math.PI / 2
    part(new THREE.SphereGeometry(1, 24, 16), [0, 0.65, 2.95], [0.37, 0.16, 0.45], ['22', '23', '31', '34', '37', '45', '46', '56'], 0x345260)
    part(new THREE.BoxGeometry(0.06, 0.45, 0.27), [0.53, 0.3, 2.5], [1, 1, 1], ['52'])
    part(new THREE.SphereGeometry(0.22, 20, 12), [0, 0.25, -3.75], [1, 1, 1.5], ['49'])
    part(new THREE.BoxGeometry(0.5, 0.12, 0.65), [0, -0.27, 2.2], [1, 1, 1], ['24'])
    part(new THREE.BoxGeometry(0.35, 0.22, 0.6), [0.55, -0.2, -0.3], [1, 1, 1], ['29'])
    const point = chapter ? new THREE.Vector3(...chapter.point) : null
    if (point) {
      part(new THREE.SphereGeometry(0.13, 20, 16), point.toArray(), [1, 1, 1], [chapter!.code], 0x22b6bd)
    }
    const draw = () => {
      renderer.render(scene, camera)
      if (point && label.current) {
        const projected = point.clone().project(camera)
        const x = Math.max(95, Math.min(container.clientWidth - 95, (projected.x + 1) * container.clientWidth / 2))
        const y = Math.max(32, Math.min(container.clientHeight - 30, (-projected.y + 1) * container.clientHeight / 2 - 35))
        label.current.style.left = `${x}px`; label.current.style.top = `${y}px`
      }
    }
    reset.current = () => { camera.position.set(9, 8, 12); controls.target.set(0, 0, 0); controls.update(); draw() }
    const resize = () => { const width = container.clientWidth; const height = container.clientHeight; if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); draw() }
    const observer = new ResizeObserver(resize)
    observer.observe(container); controls.addEventListener('change', draw)
    const lost = (event: Event) => { event.preventDefault(); setUnavailable(true) }
    renderer.domElement.addEventListener('webglcontextlost', lost)
    reset.current(); resize()
    return () => {
      reset.current = () => {}; observer.disconnect(); controls.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose())
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [chapter])

  return <section className={styles.panel} aria-label="Aircraft system overview">
    <div className={styles.heading}><div><span>AIRCRAFT SYSTEM</span><strong>{chapter ? ataLabel(chapter) : 'Select an ATA chapter'}</strong></div><button type="button" onClick={() => reset.current()}>Reset view</button></div>
    <div className={styles.viewport} ref={host}>
      {chapter && !unavailable && <div ref={label} className={styles.label}>{ataLabel(chapter)}</div>}
      {unavailable && <p className={styles.fallback}>3D view unavailable in this browser. {chapter ? ataLabel(chapter) : 'Choose the system below.'}</p>}
    </div>
    <p className={styles.caption}>Drag to rotate · Scroll to zoom · Highlights show representative system areas, not exact component locations.</p>
  </section>
}
