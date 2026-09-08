'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

import { ARM_TWIST_CONFIGS, AvatarAnimationManager, applyArmTwist } from '@/lib/avatarAnimations'
import { PANEL_AVATARS, PANEL_AVATAR_ORDER, type PanelAvatarDef, type PanelistId } from '@/lib/panelAvatars'
import { ARKIT_MOUTH_SHAPES, VISEME_ARKIT_SHAPES, VISEME_JAW_OPEN, type VisemeId } from '@/lib/textToVisemes'

/** All mouth-shape visemes present on the .glb, excluding `viseme_sil`
 * (silence) — silence is just "every shape at 0", so it's never itself a
 * blend target. */
const MOUTH_VISEMES: VisemeId[] = [
  'viseme_PP',
  'viseme_FF',
  'viseme_TH',
  'viseme_DD',
  'viseme_kk',
  'viseme_CH',
  'viseme_SS',
  'viseme_nn',
  'viseme_RR',
  'viseme_aa',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
]

/** Floor applied to a word-driven viseme's blend weight so consonants that
 * are quiet in raw amplitude (p/t/k plosives, for instance) still show a
 * visible mouth shape instead of going flat between louder vowels. */
const WORD_VISEME_MIN_WEIGHT = 0.4

const BLINK_MIN_INTERVAL_S = 2.5
const BLINK_MAX_INTERVAL_S = 6
const BLINK_DURATION_S = 0.15
const SEAT_SPACING = 0.68
/** Fallback if a rig has no findable Head bone, and — more importantly —
 * the target every seat's head-to-origin distance gets rescaled to (see
 * `scaleCorrection` in AvatarSeat below). The three panel models come from
 * unrelated sources exported at different absolute scales; without this,
 * aligning heads to the same Y line (TARGET_HEAD_Y) makes them line up but
 * leaves the actually-smaller-scaled rig looking like a shrunken figure
 * seated next to the other two. */
const DEFAULT_HEAD_HEIGHT = 1.6
/** Guard rail on the per-model scale correction below — wide enough to fix
 * a real export-scale mismatch, narrow enough that a degenerate
 * measurement (e.g. a rig with no usable Head bone) can't blow a seat up
 * or shrink it to nothing. */
const MIN_SCALE_CORRECTION = 0.6
const MAX_SCALE_CORRECTION = 1.8
/** Where every avatar's head is placed in stage space, so all three line up
 * regardless of how tall the underlying rig is. */
const TARGET_HEAD_Y = 0.02
/** Vertical world-space extent the live (non-closeup) shot frames, in the
 * same units as SEAT_SPACING. Deliberately generous rather than a tight
 * bust crop: the desk (PanelDesk, below) is what actually guarantees legs
 * stay out of frame, so this only needs to leave comfortable headroom
 * above the head bone (hair, updos, the taller hairstyles — clipping the
 * TOP of someone's head reads far worse than showing a bit more chest).
 * See StageCamera below for why this only holds if the canvas itself is
 * kept wide-and-short (a generous aspect ratio) by its caller. */
const PANEL_FRAME_HEIGHT = 1.15

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>
  morphTargetInfluences: number[]
}

function isMorphMesh(obj: THREE.Object3D): obj is MorphMesh {
  const mesh = obj as THREE.Mesh
  return (mesh as THREE.SkinnedMesh).isMesh === true && !!mesh.morphTargetDictionary && !!mesh.morphTargetInfluences
}

function setMorph(meshes: MorphMesh[], name: string, value: number) {
  for (const mesh of meshes) {
    const idx = mesh.morphTargetDictionary[name]
    if (idx === undefined) continue
    mesh.morphTargetInfluences[idx] = value
  }
}

function hasMorph(meshes: MorphMesh[], name: string): boolean {
  return meshes.some((mesh) => mesh.morphTargetDictionary[name] !== undefined)
}

/** Some rigs (e.g. Sketchfab/Mixamo exports) suffix bone names to dedupe them
 * across merged skeletons, e.g. "Head_06" / "Neck_05" instead of "Head" /
 * "Neck". Match the exact name first, falling back to a "<base>_" prefix so
 * both rig styles resolve the same bone. */
function findBoneByBaseName(root: THREE.Object3D, baseName: string): THREE.Object3D | undefined {
  const exact = root.getObjectByName(baseName)
  if (exact) return exact
  let prefixed: THREE.Object3D | undefined
  root.traverse((obj) => {
    if (!prefixed && obj.name.startsWith(`${baseName}_`)) prefixed = obj
  })
  return prefixed
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt)
}

/** One seated panelist. Always mounted and always idling (blink/breathe) so
 * switching who's speaking never re-triggers a load or a pop-in — only the
 * active seat receives real mic-out volume and word-timed visemes, everyone
 * else just idles. */
function AvatarSeat({
  avatar,
  x,
  isActive,
  isSpeaking,
  getVolume,
  getViseme,
}: {
  avatar: PanelAvatarDef
  x: number
  isActive: boolean
  /** The agent is mid-utterance, per the pipeline's own state. Used instead
   * of relying solely on measured audio level — `getVolumeLevel()` reads 0
   * whenever the agent's remote track isn't resolved/subscribed, which left
   * the mouth completely still even though words were queued and correct. */
  isSpeaking: boolean
  getVolume: () => number
  /** Advances the shared viseme timeline by `advanceMs` of speech and
   * returns the shape now showing. Pass 0 to read without advancing. */
  getViseme?: (advanceMs: number) => VisemeId | null
}) {
  const { scene } = useGLTF(avatar.modelUrl)
  const cloned = useMemo(() => SkeletonUtils.clone(scene) as THREE.Object3D, [scene])

  const morphMeshes = useMemo(() => {
    const meshes: MorphMesh[] = []
    cloned.traverse((obj) => {
      if (isMorphMesh(obj)) meshes.push(obj)
    })
    return meshes
  }, [cloned])

  const headBone = useMemo(() => findBoneByBaseName(cloned, 'Head'), [cloned])
  const neckBone = useMemo(() => findBoneByBaseName(cloned, 'Neck'), [cloned])

  // Idle sway/breathing is layered as an offset onto each bone's bind-pose
  // rotation. Writing absolute rotations here would flatten the model's own
  // natural head/neck tilt (these rigs are not zeroed at rest).
  const headRest = useMemo(() => headBone?.quaternion.clone() ?? null, [headBone])
  const neckRest = useMemo(() => neckBone?.quaternion.clone() ?? null, [neckBone])

  // Set up arm twist for models that need it (e.g., hiring_manager with specific arm positioning)
  useMemo(() => {
    // Apply arm twist if configured for this model
    const config = ARM_TWIST_CONFIGS[avatar.modelUrl]
    if (config?.enabled) {
      applyArmTwist(cloned, avatar.modelUrl)
    }
  }, [cloned, avatar.modelUrl])

  /** Height of this model's head in its own, UNSCALED space. Rigs differ
   * (the RPM avatars sit ~6cm lower than the Avatar-SDK ones, and — this
   * is the bigger one — model_m.glb's technical-interviewer rig is
   * exported at a visibly smaller absolute scale than the other two), so
   * this feeds both a uniform scale correction and a Y-position correction
   * below rather than just the latter — matching heads on the same line
   * alone still leaves a smaller-scaled rig looking like a shrunken figure
   * seated next to the other two. */
  const rawHeadHeight = useMemo(() => {
    if (!headBone) return DEFAULT_HEAD_HEIGHT
    cloned.updateMatrixWorld(true)
    const p = new THREE.Vector3()
    headBone.getWorldPosition(p)
    return p.y || DEFAULT_HEAD_HEIGHT
  }, [cloned, headBone])

  /** Uniform scale that brings THIS model's head-to-origin distance to
   * exactly DEFAULT_HEAD_HEIGHT, so every seat ends up the same apparent
   * size regardless of the source rig's own export scale. Once every seat
   * is corrected this way, each one's (now-scaled) head sits at local Y =
   * DEFAULT_HEAD_HEIGHT — the same constant for all three — which is what
   * lets the position offset below use one fixed value instead of the
   * old per-model `TARGET_HEAD_Y - headHeight`. */
  const scaleCorrection = useMemo(() => {
    if (!rawHeadHeight || rawHeadHeight <= 0) return 1
    return THREE.MathUtils.clamp(DEFAULT_HEAD_HEIGHT / rawHeadHeight, MIN_SCALE_CORRECTION, MAX_SCALE_CORRECTION)
  }, [rawHeadHeight])

  // Not every avatar ships the full ARKit/Oculus viseme set. Rigs that do
  // (Ready Player Me exports) get true per-word viseme shapes; rigs that
  // only carry a partial set — e.g. brow/eye/mouth-corner shapes with no
  // `jawOpen` or `viseme_*` — fall back to driving whatever mouth shapes
  // they DO have, so the face still moves while speaking instead of sitting
  // frozen. Detected once per model rather than probed every frame.
  const supportsVisemes = useMemo(() => hasMorph(morphMeshes, 'viseme_aa'), [morphMeshes])
  const supportsJawOpen = useMemo(() => hasMorph(morphMeshes, 'jawOpen'), [morphMeshes])
  const supportsMouthClose = useMemo(() => hasMorph(morphMeshes, 'mouthClose'), [morphMeshes])
  const supportsBrows = useMemo(() => hasMorph(morphMeshes, 'browInnerUp'), [morphMeshes])
  /** ARKit mouth shapes this rig actually has, used to compose visemes when
   * it has no ready-made `viseme_*` targets. */
  const arkitShapes = useMemo(
    () => (hasMorph(morphMeshes, 'viseme_aa') ? [] : ARKIT_MOUTH_SHAPES.filter((n) => hasMorph(morphMeshes, n))),
    [morphMeshes],
  )
  const scratchEuler = useMemo(() => new THREE.Euler(), [])
  const scratchQuat = useMemo(() => new THREE.Quaternion(), [])

  // Drives arm/hand gestures and spine posture only. Head/neck idle motion
  // and all mouth movement are owned here instead (see useFrame below), so
  // nothing is written twice per frame by two different systems.
  const animationManager = useMemo(
    () => new AvatarAnimationManager({ scene: cloned }, undefined, undefined, avatar.modelUrl),
    [cloned, avatar.modelUrl],
  )

  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const isSpeakingRef = useRef(isSpeaking)
  isSpeakingRef.current = isSpeaking

  const smoothedVolume = useRef(0)
  const visemeInfluences = useRef<Record<VisemeId, number>>(
    Object.fromEntries(MOUTH_VISEMES.map((v) => [v, 0])) as Record<VisemeId, number>,
  )
  // Fallback random-cycle state, used only while the seat is actively
  // speaking but no word-timed viseme has arrived yet
  const fallbackViseme = useRef(0)
  const fallbackSwitchAt = useRef(0)
  const arkitInfluences = useRef<Record<string, number>>({})
  const jawOpenValue = useRef(0)
  const mouthCloseValue = useRef(0)
  // Track if this seat just became active - used to delay fallback lip-sync until words arrive
  const becameActiveAt = useRef(0)
  const hadWordVisemeWhileActive = useRef(false)
  // Eye expression: gaze drifts to a new spot every few seconds so the
  // stare isn't dead, and brows lift a little on emphasis while speaking.
  const gazeTarget = useRef({ x: 0, y: 0 })
  const gazeCurrent = useRef({ x: 0, y: 0 })
  const gazeNextAt = useRef(0)
  const browValue = useRef(0)
  const blinkAt = useRef(BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S))
  const blinkPhase = useRef<'idle' | 'closing' | 'opening'>('idle')
  const blinkValue = useRef(0)
  const clock = useRef(Math.random() * 10)
  const glowRef = useRef<THREE.Mesh>(null)
  const seatGroupRef = useRef<THREE.Group>(null)

  // Track speaking intensity for hand gestures
  const lastIntensity = useRef<'low' | 'medium' | 'high'>('low')

  useFrame((_, dt) => {
    clock.current += dt

    // Track when this seat becomes active (for word data detection on handoff)
    if (isActiveRef.current && becameActiveAt.current === 0) {
      becameActiveAt.current = clock.current
      hadWordVisemeWhileActive.current = false
    } else if (!isActiveRef.current) {
      becameActiveAt.current = 0
      hadWordVisemeWhileActive.current = false
    }

    const raw = isActiveRef.current ? Math.min(1, Math.max(0, getVolume())) : 0
    smoothedVolume.current = damp(smoothedVolume.current, raw, 12, dt)
    const amplitude = smoothedVolume.current

    // Determine speaking intensity for hand gestures - with hysteresis for stability
    let intensity: 'low' | 'medium' | 'high' = 'low'
    if (isActiveRef.current) {
      // Use hysteresis to prevent rapid changes
      const hysteresis = 0.05
      if (amplitude > 0.55) intensity = 'high'
      else if (amplitude > 0.25) intensity = 'medium'
      else intensity = 'low'
    }

    // Trigger hand gesture on intensity change (with debouncing)
    if (isActiveRef.current && intensity !== lastIntensity.current) {
      // Only change if difference is significant
      const intensityMap = { low: 1, medium: 2, high: 3 }
      if (Math.abs(intensityMap[intensity] - intensityMap[lastIntensity.current]) > 0) {
        animationManager.triggerSpeakingGesture(intensity)
        lastIntensity.current = intensity
      }
    }

    // Reset animations when becoming inactive
    if (!isActiveRef.current && lastIntensity.current !== 'low') {
      animationManager.reset()
      lastIntensity.current = 'low'
    }

    // Whether this seat is mid-utterance. Measured volume alone is not
    // trustworthy here: getVolumeLevel() reads 0 unless the agent's remote
    // audio track is resolved and subscribed, and when it did the whole
    // mouth froze despite the word queue being correct. The pipeline's own
    // speaking state is the reliable signal; volume, when present, still
    // modulates how forceful the motion looks.
    const speaking = isActiveRef.current && (isSpeakingRef.current || amplitude > 0.04)

    // Only the active seat consumes the queue, and only while speaking — so
    // the mouth advances in step with the utterance rather than racing
    // ahead of it on wall-clock time.
    const wordViseme = isActiveRef.current ? (getViseme?.(speaking ? dt * 1000 : 0) ?? null) : null
    const hasWordViseme = wordViseme !== null && wordViseme !== 'viseme_sil'

    if (!hasWordViseme && speaking && clock.current >= fallbackSwitchAt.current) {
      fallbackViseme.current = Math.floor(Math.random() * MOUTH_VISEMES.length)
      fallbackSwitchAt.current = clock.current + 0.09 + Math.random() * 0.1
    }

    if (morphMeshes.length > 0) {
      const envelope = speaking ? Math.min(1, 0.7 + amplitude * 0.6) : 0

      if (supportsVisemes) {
        for (let i = 0; i < MOUTH_VISEMES.length; i++) {
          const viseme = MOUTH_VISEMES[i]
          let target = 0
          if (hasWordViseme && speaking && viseme === wordViseme) {
            // Floor the weight so quiet consonants still show a shape, but
            // only while sound is actually coming out — otherwise the mouth
            // would freeze holding a viseme between turns.
            target = Math.max(envelope, WORD_VISEME_MIN_WEIGHT)
          } else if (!hasWordViseme && speaking && i === fallbackViseme.current) {
            target = amplitude
          }
          // Consonants need to snap (a "p" that eases in isn't a "p");
          // vowels can glide. Damping faster toward a closed/quiet shape
          // than an open one also stops the mouth hanging open at word end.
          const lambda = target > visemeInfluences.current[viseme] ? 26 : 20
          visemeInfluences.current[viseme] = damp(visemeInfluences.current[viseme], target, lambda, dt)
          setMorph(morphMeshes, viseme, visemeInfluences.current[viseme])
        }
      } else if (arkitShapes.length > 0) {
        // This rig ships the standard ARKit blendshapes but no ready-made
        // viseme shapes, so each viseme is *composed* from ARKit shapes
        // (see VISEME_ARKIT_SHAPES) — real lip-sync, not a generic flap.
        // Every referenced shape is driven each frame (to 0 when unused) so
        // a previous viseme's lips can't linger.
        // Composed shapes are individually subtler than a purpose-built
        // viseme, and at panel distance the faces are small — so lift the
        // envelope to a strong floor while speaking, otherwise the lips
        // barely register even though the data is correct.
        const arkitEnvelope = speaking ? Math.max(0.85, envelope) : 0
        const active = hasWordViseme && speaking ? VISEME_ARKIT_SHAPES[wordViseme] : null
        for (const name of arkitShapes) {
          const target = active ? Math.min(1, (active[name] ?? 0) * arkitEnvelope) : 0
          const prev = arkitInfluences.current[name] ?? 0
          const next = damp(prev, target, target > prev ? 26 : 20, dt)
          arkitInfluences.current[name] = next
          setMorph(morphMeshes, name, next)
        }
      }

      if (supportsJawOpen) {
        // The jaw follows the VISEME, not raw volume — this is what makes
        // the teeth part on "ah" and stay shut on "m" regardless of how
        // loud the audio happens to be. Both rig families carry jawOpen on
        // the teeth mesh as well as the head (Wolf3D_Teeth /
        // AvatarTeethLower), so the teeth travel with the jaw.
        // Keep most of the viseme's characteristic opening even when the
        // audio is quiet — TTS output often sits well below 1.0, and
        // scaling the jaw down with it made speech look mumbled.
        const jawTarget =
          hasWordViseme && speaking
            ? VISEME_JAW_OPEN[wordViseme] * (0.85 + amplitude * 0.15)
            : speaking
              ? amplitude * 0.35
              : 0
        jawOpenValue.current = damp(jawOpenValue.current, jawTarget, jawTarget > jawOpenValue.current ? 24 : 18, dt)
        setMorph(morphMeshes, 'jawOpen', jawOpenValue.current)

        // Lips press together on closed visemes so "m"/"b"/"p" actually
        // seal. Skipped for ARKit rigs, where mouthClose is already part of
        // the composed viseme above and would otherwise be applied twice.
        if (supportsMouthClose && supportsVisemes) {
          const closeTarget = hasWordViseme && speaking && VISEME_JAW_OPEN[wordViseme] < 0.05 ? 0.7 : 0
          mouthCloseValue.current = damp(mouthCloseValue.current, closeTarget, 24, dt)
          setMorph(morphMeshes, 'mouthClose', mouthCloseValue.current)
        }
      }

      if (blinkPhase.current === 'idle' && clock.current >= blinkAt.current) {
        blinkPhase.current = 'closing'
      }
      if (blinkPhase.current === 'closing') {
        blinkValue.current = Math.min(1, blinkValue.current + dt / (BLINK_DURATION_S / 2))
        if (blinkValue.current >= 1) blinkPhase.current = 'opening'
      } else if (blinkPhase.current === 'opening') {
        blinkValue.current = Math.max(0, blinkValue.current - dt / (BLINK_DURATION_S / 2))
        if (blinkValue.current <= 0) {
          blinkPhase.current = 'idle'
          blinkAt.current =
            clock.current + BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S)
        }
      }
      setMorph(morphMeshes, 'eyeBlinkLeft', blinkValue.current)
      setMorph(morphMeshes, 'eyeBlinkRight', blinkValue.current)

      // --- Eye expression ---------------------------------------------
      // Saccades: pick a new gaze point periodically, then ease toward it.
      // A speaker glances around more than a listener does.
      if (clock.current >= gazeNextAt.current) {
        const range = speaking ? 0.35 : 0.2
        gazeTarget.current.x = (Math.random() * 2 - 1) * range
        gazeTarget.current.y = (Math.random() * 2 - 1) * range * 0.6
        gazeNextAt.current = clock.current + (speaking ? 0.7 : 1.6) + Math.random() * 1.8
      }
      gazeCurrent.current.x = damp(gazeCurrent.current.x, gazeTarget.current.x, 9, dt)
      gazeCurrent.current.y = damp(gazeCurrent.current.y, gazeTarget.current.y, 9, dt)

      const gx = gazeCurrent.current.x
      const gy = gazeCurrent.current.y
      // eyeLook* morphs are one-directional, so split the signed gaze into
      // opposing pairs. In/Out are mirrored per eye (both eyes converge).
      setMorph(morphMeshes, 'eyeLookUpLeft', Math.max(0, gy))
      setMorph(morphMeshes, 'eyeLookUpRight', Math.max(0, gy))
      setMorph(morphMeshes, 'eyeLookDownLeft', Math.max(0, -gy))
      setMorph(morphMeshes, 'eyeLookDownRight', Math.max(0, -gy))
      setMorph(morphMeshes, 'eyeLookOutLeft', Math.max(0, -gx))
      setMorph(morphMeshes, 'eyeLookInRight', Math.max(0, -gx))
      setMorph(morphMeshes, 'eyeLookInLeft', Math.max(0, gx))
      setMorph(morphMeshes, 'eyeLookOutRight', Math.max(0, gx))

      // Brows lift with vocal emphasis — a small cue, but it's most of the
      // difference between "talking" and "expressive".
      if (supportsBrows) {
        const browTarget = speaking ? Math.min(0.55, amplitude * 0.7) : 0
        browValue.current = damp(browValue.current, browTarget, 8, dt)
        setMorph(morphMeshes, 'browInnerUp', browValue.current)
        setMorph(morphMeshes, 'browOuterUpLeft', browValue.current * 0.6)
        setMorph(morphMeshes, 'browOuterUpRight', browValue.current * 0.6)
      }
    }

    // Update body language and hand animations
    animationManager.update(dt * 1000) // Convert to milliseconds

    if (headBone && headRest) {
      const sway = Math.sin(clock.current * 0.6) * 0.03
      const bob = Math.sin(clock.current * 1.7) * (0.01 + amplitude * 0.02)
      const focusTilt = isActiveRef.current ? 0.05 : 0
      scratchEuler.set(bob + focusTilt, sway, 0)
      scratchQuat.setFromEuler(scratchEuler)
      headBone.quaternion.copy(headRest).multiply(scratchQuat)
    }
    if (neckBone && neckRest) {
      const breathe = Math.sin(clock.current * 0.9) * 0.008
      scratchEuler.set(0, 0, breathe)
      scratchQuat.setFromEuler(scratchEuler)
      neckBone.quaternion.copy(neckRest).multiply(scratchQuat)
    }

    if (seatGroupRef.current) {
      // scaleCorrection normalizes this rig's own export scale to match
      // the other seats (see its definition above) — the active-speaker
      // pulse (1.05x) is layered multiplicatively on top of it, never in
      // place of it.
      const targetScale = (isActiveRef.current ? 1.05 : 1) * scaleCorrection
      const nextScale = damp(seatGroupRef.current.scale.x, targetScale, 8, dt)
      seatGroupRef.current.scale.setScalar(nextScale)
    }
    if (glowRef.current) {
      const material = glowRef.current.material as THREE.MeshBasicMaterial
      const targetOpacity = isActiveRef.current ? 0.55 + amplitude * 0.35 : 0
      material.opacity = damp(material.opacity, targetOpacity, 10, dt)
    }
  })

  return (
    <group position={[x, 0, 0]}>
      <mesh ref={glowRef} position={[0, 0.02, -0.08]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 32]} />
        <meshBasicMaterial color={avatar.accentColor} transparent opacity={0} depthWrite={false} />
      </mesh>
      <group
        ref={seatGroupRef}
        position={[0, TARGET_HEAD_Y - rawHeadHeight * scaleCorrection, 0]}
        scale={scaleCorrection}
      >
        <primitive object={cloned} />
      </group>
    </group>
  )
}

function PanelLights() {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[1, 2, 2]} intensity={1.1} />
      <directionalLight position={[-1.5, 1, -1]} intensity={0.35} />
    </>
  )
}

/** Where the desk's front edge sits, as an offset below the head bone —
 * shared with the camera framing below it so the two stay in sync. */
const DESK_TOP_Y = TARGET_HEAD_Y - 0.42

/** A literal conference-table edge in front of the seats.
 *
 * These rigs are full standing figures with no seated pose — bending
 * individual hip/knee bones to fake a sit would need per-model rig
 * knowledge (bone names and rotation axes) this project doesn't have for
 * three unrelated model sources, and getting that wrong reads as a broken,
 * twisted pose, worse than not trying at all. A physical desk mesh gets
 * the same "seated at a table" read without touching a single bone: it
 * simply sits nearer the camera than the seats, at a height that occludes
 * everything from the waist down, the same way a real desk hides a real
 * interviewer's legs on a video call. The camera framing above is tuned to
 * match this same line, so the two reinforce each other rather than
 * depending on either alone being pixel-perfect. */
function PanelDesk({ seatCount }: { seatCount: number }) {
  const width = (seatCount - 1) * SEAT_SPACING + 1.7

  return (
    <group>
      {/* Front edge — a lighter strip catching the key light, reading as
          the table's near lip. */}
      <mesh position={[0, DESK_TOP_Y, 0.34]}>
        <boxGeometry args={[width, 0.035, 0.07]} />
        <meshStandardMaterial color="#6b5842" roughness={0.35} metalness={0.05} />
      </mesh>
      {/* Body of the desk — a tall dark panel dropping well below the
          visible frame, so there's never a gap between the edge and the
          bottom of the shot regardless of viewport height. */}
      <mesh position={[0, DESK_TOP_Y - 0.7, 0.31]}>
        <boxGeometry args={[width, 1.4, 0.05]} />
        <meshStandardMaterial color="#241f1a" roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Half-width of stage space the seats themselves occupy, shoulders
 * included. Anything placed inside this band ends up directly behind a
 * person; the backdrop keeps its furniture outside it so nothing reads as a
 * slab growing out of someone's back. */
const SEAT_BAND_HALF_WIDTH = 1.55

/** The room the panel is sitting in.
 *
 * Without this the seats float against the page background, which reads as
 * three avatars pasted onto a UI rather than three people in a room.
 *
 * Two rules shape all of it. First, everything lives behind the seats or
 * below the desk, so no piece can ever intersect a rig — the one failure
 * that would genuinely look broken. Second, the area directly behind the
 * trio (|x| < SEAT_BAND_HALF_WIDTH) stays deliberately plain: an earlier
 * pass put lit panels at x = ±1.45 and they landed squarely behind the
 * outer two interviewers, reading as boards bolted to their backs rather
 * than as a room. Office detail is pushed out past that band, where it
 * frames the group on a wide canvas and simply falls off-frame on a narrow
 * one.
 *
 * Tones are light warm neutrals to match the rest of the product's palette
 * and, more practically, to separate dark-suited figures from the wall —
 * the previous near-black room left two of the three panelists sinking into
 * their own background. */
function OfficeBackdrop() {
  const wallZ = -1.6
  const floorY = TARGET_HEAD_Y - DEFAULT_HEAD_HEIGHT
  // Sized past any plausible frustum rather than fitted to one: at this
  // depth the visible width scales with the canvas aspect ratio, and a wall
  // that stops short of the edge would show a seam of empty page behind it.
  const WALL_WIDTH = 26
  const WALL_HEIGHT = 14
  const glassCenterY = TARGET_HEAD_Y + 0.15
  const glassHeight = 1.9

  return (
    <group>
      {/* Back wall. */}
      <mesh position={[0, TARGET_HEAD_Y - 0.4, wallZ]}>
        <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
        <meshStandardMaterial color="#ded7c9" roughness={1} metalness={0} />
      </mesh>

      {/* Floor. Barely visible past the desk, but it stops the wall/desk
          junction reading as a single flat backdrop. */}
      <mesh position={[0, floorY, wallZ / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WALL_WIDTH, 8]} />
        <meshStandardMaterial color="#c3baa9" roughness={1} metalness={0} />
      </mesh>

      {/* Horizontal trim, well above head height. Horizontal lines can pass
          behind a head without looking like something impaling it — which
          is exactly why the wall detail here is banded rather than
          vertically mullioned across the middle. */}
      <mesh position={[0, TARGET_HEAD_Y + 1.15, wallZ + 0.01]}>
        <boxGeometry args={[WALL_WIDTH, 0.04, 0.01]} />
        <meshStandardMaterial color="#b3aa98" roughness={0.9} metalness={0} />
      </mesh>

      {/* Glass partition wings, strictly outside the seat band. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (SEAT_BAND_HALF_WIDTH + 1.7), glassCenterY, wallZ + 0.02]}>
          <mesh>
            <planeGeometry args={[3.2, glassHeight]} />
            <meshStandardMaterial color="#cfdad9" roughness={0.55} metalness={0} />
          </mesh>
          {/* Frame: sill, head rail, and mullions at the panel's own
              divisions — all far enough out to never sit behind a seat. */}
          <mesh position={[0, glassHeight / 2, 0.01]}>
            <boxGeometry args={[3.2, 0.05, 0.02]} />
            <meshStandardMaterial color="#8d8474" roughness={0.8} metalness={0} />
          </mesh>
          <mesh position={[0, -glassHeight / 2, 0.01]}>
            <boxGeometry args={[3.2, 0.05, 0.02]} />
            <meshStandardMaterial color="#8d8474" roughness={0.8} metalness={0} />
          </mesh>
          {[-1.06, 0, 1.06].map((offset) => (
            <mesh key={offset} position={[offset, 0, 0.01]}>
              <boxGeometry args={[0.04, glassHeight, 0.02]} />
              <meshStandardMaterial color="#8d8474" roughness={0.8} metalness={0} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** A high-back office chair silhouette behind each seat.
 *
 * PanelDesk hides everything below its own top edge, so this only needs to
 * cover the region above the desk line: a backrest wide enough to peek out
 * past each avatar's shoulders, topped with a headrest that clears the
 * shoulder/neck area. Sits just behind the seat (closer to the wall than
 * the avatar, well clear of the desk in front of it) so it reads as the
 * chair each panelist is actually sitting in rather than another piece of
 * office furniture. */
function ChairBack({ x }: { x: number }) {
  const backBottomY = DESK_TOP_Y - 0.05
  const backTopY = TARGET_HEAD_Y + 0.3
  const backHeight = backTopY - backBottomY
  const backCenterY = (backBottomY + backTopY) / 2
  const chairZ = -0.32

  return (
    <group position={[x, 0, chairZ]}>
      <mesh position={[0, backCenterY, 0]}>
        <boxGeometry args={[0.54, backHeight, 0.07]} />
        <meshStandardMaterial color="#332f2a" roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[0, backTopY - 0.07, 0.025]}>
        <boxGeometry args={[0.38, 0.16, 0.08]} />
        <meshStandardMaterial color="#3d3832" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  )
}

/** Frames the camera to fit however many seats are on stage.
 *
 * r3f only reads <Canvas camera={...}> when it first creates the camera —
 * later prop changes are ignored — so framing is applied imperatively here
 * instead. It's also derived from the seat count and spacing rather than
 * hardcoded, so changing SEAT_SPACING can't silently crop the outer seats. */
function StageCamera({ seatCount, closeUp }: { seatCount: number; closeUp: boolean }) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.viewport.aspect)

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    const fov = closeUp ? 22 : 34
    perspective.fov = fov

    let y: number
    let z: number
    if (closeUp) {
      y = TARGET_HEAD_Y + 0.06
      z = 0.42
    } else {
      // Widest point the panel occupies: the seat span plus a body's width
      // of shoulders, with a little breathing room.
      const spanX = (seatCount - 1) * SEAT_SPACING + 0.95
      const halfFovH = THREE.MathUtils.degToRad(fov) / 2
      // Horizontal FOV depends on aspect, so fit against whichever axis is
      // tighter — a narrow pane must pull back further. When width ends up
      // the binding constraint, the vertical extent actually shown is
      // spanX / aspect regardless of z — which is why the caller keeps this
      // canvas wide-and-short (a generous aspect ratio) rather than letting
      // it fill an arbitrarily tall flex column: on a cramped aspect this
      // term can pull the camera back far enough to reveal the seats'
      // knees and feet instead of the head-to-chest shot PANEL_FRAME_HEIGHT
      // asks for.
      const zForWidth = spanX / 2 / (Math.tan(halfFovH) * Math.max(aspect, 0.35))
      // PANEL_FRAME_HEIGHT units of vertical frame, biased low: the
      // look-at point sits only 0.2x of that height below the head bone —
      // vs. 0.5x for a frame centered on the head — so most of the extra
      // room lands ABOVE the head (hair clearance) rather than being split
      // evenly, since everything below the desk line is hidden by PanelDesk
      // regardless of how far down the frame itself actually reaches.
      const zForHeight = PANEL_FRAME_HEIGHT / 2 / Math.tan(halfFovH)
      z = Math.max(zForWidth, zForHeight)
      y = TARGET_HEAD_Y - PANEL_FRAME_HEIGHT * 0.28
    }

    perspective.position.set(0, y, z)
    perspective.lookAt(0, closeUp ? TARGET_HEAD_Y + 0.02 : TARGET_HEAD_Y - PANEL_FRAME_HEIGHT * 0.2, 0)
    perspective.updateProjectionMatrix()
  }, [camera, seatCount, closeUp, aspect])

  return null
}

export interface PanelStageProps {
  activeId: PanelistId
  /** True while the agent is mid-utterance. Drives the mouth even when the
   * measured audio level is unavailable. */
  isSpeaking?: boolean
  getVolume: () => number
  getViseme?: (advanceMs: number) => VisemeId | null
  className?: string
  /** Render only the active panelist, framed close on the face. Intended
   * for inspecting mouth shapes during development, not for the live call. */
  debugSingleSeat?: boolean
}

/** All three interviewers on screen at once, seated side by side — the
 * active speaker (driven by live panel state) gets a subtle glow, a light
 * lean-in, and word-timed lip-sync; the other two just idle. */
export function PanelStage({
  activeId,
  isSpeaking = false,
  getVolume,
  getViseme,
  className,
  debugSingleSeat,
}: PanelStageProps) {
  const seats = debugSingleSeat ? [activeId] : PANEL_AVATAR_ORDER
  const startX = -((seats.length - 1) * SEAT_SPACING) / 2

  return (
    <div className={className} aria-hidden="true">
      <Canvas gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <StageCamera seatCount={seats.length} closeUp={!!debugSingleSeat} />
        <PanelLights />
        {!debugSingleSeat ? <OfficeBackdrop /> : null}
        {!debugSingleSeat ? seats.map((id, index) => <ChairBack key={id} x={startX + index * SEAT_SPACING} />) : null}
        {seats.map((id, index) => (
          <AvatarSeat
            key={id}
            avatar={PANEL_AVATARS[id]}
            x={startX + index * SEAT_SPACING}
            isActive={id === activeId}
            isSpeaking={isSpeaking}
            getVolume={getVolume}
            getViseme={getViseme}
          />
        ))}
        {!debugSingleSeat ? <PanelDesk seatCount={seats.length} /> : null}
      </Canvas>
    </div>
  )
}

export function preloadPanelAvatarModel(modelUrl: string) {
  useGLTF.preload(modelUrl)
}

/** Kicks off fetching all three panelist .glb files (several MB each) into
 * drei's GLTF cache. `.preload` is a static loader call, not a hook, so this
 * is safe to call from a plain effect anywhere in the app — not just from
 * inside the live call.
 *
 * Call this as early as possible in the interview funnel (resume analysis,
 * the setup form) rather than waiting until the candidate actually reaches
 * the call: by the time useCharacterAssetLoader's readiness gate runs in
 * ConversationComponent, the models are already warm in cache and that gate
 * resolves near-instantly instead of blocking on a multi-MB download. */
export function preloadAllPanelAvatars() {
  for (const id of PANEL_AVATAR_ORDER) {
    preloadPanelAvatarModel(PANEL_AVATARS[id].modelUrl)
  }
}
