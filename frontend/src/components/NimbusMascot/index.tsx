import welcome from '@/assets/mascots/welcome.svg'
import ready from '@/assets/mascots/ready.svg'
import wave from '@/assets/mascots/wave.svg'
import guide from '@/assets/mascots/guide.svg'
import complete from '@/assets/mascots/complete.svg'
import attention from '@/assets/mascots/attention.svg'
import styles from './NimbusMascot.module.css'

const poses = { welcome, ready, wave, guide, complete, attention }
type Pose = keyof typeof poses
const descriptions: Record<Pose, string> = {
  welcome: 'Nimbus welcomes you', ready: 'Nimbus wearing a hard hat', wave: 'Nimbus waving in a hard hat',
  guide: 'Nimbus giving a thumbs-up in a hard hat', complete: 'Nimbus giving a thumbs-up, hard hat off',
  attention: 'Nimbus holding a stop sign for an unresolved physical condition',
}
export default function NimbusMascot({ pose = 'welcome', listening = false }: { pose?: Pose; listening?: boolean }) {
  return <div className={styles.mascot}><img src={poses[pose]} alt={descriptions[pose]} width="512" height="288" />{listening && <span className={styles.listening} role="status">● Listening</span>}</div>
}
