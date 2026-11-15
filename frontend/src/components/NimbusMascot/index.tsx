import styles from './NimbusMascot.module.css'

export default function NimbusMascot() {
  return (
    <div className={styles.mascot} role="img" aria-label="Nimbus cloud mascot placeholder">
      <svg viewBox="0 0 360 240" aria-hidden="true">
        <ellipse cx="180" cy="216" rx="94" ry="9" fill="#dce3e7" opacity=".55" />
        <path d="M94 181C55 181 36 157 36 127c0-33 25-58 57-58 9 0 18 2 25 5C128 40 151 22 181 22c35 0 62 23 68 57 8-3 16-4 24-4 30 0 54 24 54 54s-23 53-54 53h-23c-8 14-20 21-35 21-14 0-26-6-35-16-9 10-21 16-36 16-16 0-28-8-35-22Z" fill="white" stroke="#d7dfe4" strokeWidth="2" />
        <ellipse cx="156" cy="123" rx="6" ry="9" fill="#287780" />
        <ellipse cx="205" cy="123" rx="6" ry="9" fill="#287780" />
        <path d="M167 145q14 13 28 0" stroke="#287780" strokeWidth="4" strokeLinecap="round" fill="none" />
        <ellipse cx="139" cy="140" rx="10" ry="5" fill="#f7dfd7" />
        <ellipse cx="221" cy="140" rx="10" ry="5" fill="#f7dfd7" />
      </svg>
    </div>
  )
}
