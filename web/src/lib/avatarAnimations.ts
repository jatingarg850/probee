/**
 * Avatar Animation System for realistic speaking animations
 * Handles lip-sync, hand positioning, and body language
 */

import * as THREE from 'three'

export interface LipSyncPhoneme {
  phoneme: string
  jawRotation: number // Y-axis rotation in radians
  duration: number // milliseconds
}

// Phoneme to jaw position mapping
// Map common phonemes to jaw opening angles (in radians)
export const PHONEME_MAP: Record<string, number> = {
  // Closed mouth phonemes
  p: 0.0,
  b: 0.0,
  m: 0.05,
  f: 0.1,
  v: 0.1,

  // Mid-open phonemes
  e: 0.15,
  i: 0.15,
  ə: 0.2,
  ɛ: 0.2,

  // Open phonemes
  a: 0.35,
  ɑ: 0.35,
  ɔ: 0.3,
  o: 0.25,
  u: 0.15,

  // Special sounds
  θ: 0.1, // th
  ð: 0.15, // th
  s: 0.08,
  z: 0.08,
  ʃ: 0.12, // sh
  ʒ: 0.12, // zh
  t: 0.05,
  d: 0.05,
  n: 0.05,
  l: 0.1,
  r: 0.2,
  j: 0.15,
  w: 0.2,
  k: 0.05,
  g: 0.05,
  h: 0.1,

  // Default
  neutral: 0.0,
}

/**
 * Hand position presets for natural speaking gestures
 */
export interface HandPose {
  name: string
  leftArm: { x: number; y: number; z: number }
  rightArm: { x: number; y: number; z: number }
  leftForeArm: { x: number; y: number; z: number }
  rightForeArm: { x: number; y: number; z: number }
  leftHand: { x: number; y: number; z: number }
  rightHand: { x: number; y: number; z: number }
}

/**
 * Model-specific arm twist adjustments
 * Used to apply model-specific arm rotations
 */
export interface ArmTwistConfig {
  enabled: boolean
  leftArmTwist: { x: number; y: number; z: number }
  rightArmTwist: { x: number; y: number; z: number }
}

// IMPORTANT: every value below is an OFFSET applied on top of the model's
// own bind pose, never an absolute rotation.
export const HAND_POSES: Record<string, HandPose> = {
  // Neutral: exactly the model's own rest pose, no offset at all.
  neutral: {
    name: 'neutral',
    leftArm: { x: 0, y: 0, z: 0 },
    rightArm: { x: 0, y: 0, z: 0 },
    leftForeArm: { x: 0, y: 0, z: 0 },
    rightForeArm: { x: 0, y: 0, z: 0 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 },
  },

  // Explaining: forearms come up a little, upper arms open slightly.
  explaining: {
    name: 'explaining',
    leftArm: { x: -0.08, y: 0, z: 0.1 },
    rightArm: { x: -0.08, y: 0, z: -0.1 },
    leftForeArm: { x: -0.35, y: 0, z: 0.12 },
    rightForeArm: { x: -0.35, y: 0, z: -0.12 },
    leftHand: { x: 0.05, y: 0, z: 0 },
    rightHand: { x: 0.05, y: 0, z: 0 },
  },

  // Thinking: one forearm lifts toward the chin.
  thinking: {
    name: 'thinking',
    leftArm: { x: -0.2, y: 0, z: 0.15 },
    rightArm: { x: 0, y: 0, z: 0 },
    leftForeArm: { x: -1.1, y: 0, z: 0.2 },
    rightForeArm: { x: 0, y: 0, z: 0 },
    leftHand: { x: 0.1, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 },
  },

  // Emphasizing: a bit more open and lifted than "explaining".
  emphasizing: {
    name: 'emphasizing',
    leftArm: { x: -0.12, y: 0, z: 0.16 },
    rightArm: { x: -0.12, y: 0, z: -0.16 },
    leftForeArm: { x: -0.5, y: 0, z: 0.18 },
    rightForeArm: { x: -0.5, y: 0, z: -0.18 },
    leftHand: { x: -0.1, y: 0, z: 0 },
    rightHand: { x: -0.1, y: 0, z: 0 },
  },

  // Pointing: one forearm extends forward.
  pointing: {
    name: 'pointing',
    leftArm: { x: 0, y: 0, z: 0 },
    rightArm: { x: -0.18, y: 0, z: -0.12 },
    leftForeArm: { x: 0, y: 0, z: 0 },
    rightForeArm: { x: -0.55, y: 0, z: -0.1 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: -0.15, y: 0, z: 0 },
  },

  // Listening: essentially rest, with the faintest settle.
  listening: {
    name: 'listening',
    leftArm: { x: 0, y: 0, z: 0.02 },
    rightArm: { x: 0, y: 0, z: -0.02 },
    leftForeArm: { x: -0.05, y: 0, z: 0 },
    rightForeArm: { x: -0.05, y: 0, z: 0 },
    leftHand: { x: 0, y: 0, z: 0 },
    rightHand: { x: 0, y: 0, z: 0 },
  },
}

/**
 * Model-specific arm twist configurations
 * Allows different models to have different arm twist angles (e.g., 90-degree inversion)
 */
export const ARM_TWIST_CONFIGS: Record<string, ArmTwistConfig> = {
  '/models/model.glb': {
    enabled: false,
    leftArmTwist: { x: 0, y: 0, z: 0 },
    rightArmTwist: { x: 0, y: 0, z: 0 },
  },
  '/models/model_m.glb': {
    enabled: false,
    leftArmTwist: { x: 0, y: 0, z: 0 },
    rightArmTwist: { x: 0, y: 0, z: 0 },
  },
  '/models/hiring_manager.glb': {
    // Exact arm positioning for hiring_manager from AvatarModel component
    enabled: true,
    leftArmTwist: { x: 1.2, y: 0.2, z: 0 },
    rightArmTwist: { x: 1.2, y: -0.2, z: 0 },
  },
}

/**
 * Body language animations for natural speaking
 */
export interface BodyLanguagePose {
  name: string
  spine: { x: number; y: number; z: number }
  neck: { x: number; y: number; z: number }
  head: { x: number; y: number; z: number }
}

export const BODY_LANGUAGE: Record<string, BodyLanguagePose> = {
  // Attentive: slight forward lean
  attentive: {
    name: 'attentive',
    spine: { x: 0.05, y: 0, z: 0 },
    neck: { x: 0.1, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
  },

  // Engaged: head tilted slightly
  engaged: {
    name: 'engaged',
    spine: { x: 0, y: 0, z: 0 },
    neck: { x: 0.05, y: 0, z: 0 },
    head: { x: 0.1, y: 0.05, z: 0 },
  },

  // Thinking: head tilted back
  thinking: {
    name: 'thinking',
    spine: { x: -0.05, y: 0, z: 0 },
    neck: { x: -0.1, y: 0, z: 0 },
    head: { x: -0.15, y: 0, z: 0 },
  },

  // Disagreeing: head shake motion
  disagreeing: {
    name: 'disagreeing',
    spine: { x: 0, y: 0, z: 0 },
    neck: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0.3, z: 0 }, // Will be animated back and forth
  },

  // Agreeing: head nod motion
  agreeing: {
    name: 'agreeing',
    spine: { x: 0, y: 0, z: 0 },
    neck: { x: 0.1, y: 0, z: 0 },
    head: { x: 0.15, y: 0, z: 0 }, // Will be animated up and down
  },
}

/**
 * Apply model-specific arm twist to arm bones
 * Useful for models like hiring_manager that need specific arm positioning
 */
export function applyArmTwist(scene: THREE.Object3D, modelUrl: string) {
  const config = ARM_TWIST_CONFIGS[modelUrl]
  if (!config || !config.enabled) return

  const armBones: Record<string, string> = {
    leftArm: 'LeftArm',
    rightArm: 'RightArm',
  }

  scene.traverse((obj) => {
    if (obj.name === armBones.leftArm) {
      // Apply exact rotations for hiring_manager
      obj.rotation.y = config.leftArmTwist.y
      obj.rotation.x = config.leftArmTwist.x
      obj.rotation.z = config.leftArmTwist.z
    } else if (obj.name === armBones.rightArm) {
      obj.rotation.y = config.rightArmTwist.y
      obj.rotation.x = config.rightArmTwist.x
      obj.rotation.z = config.rightArmTwist.z
    }
  })
}
export class AudioAnalyzer {
  private analyser: AnalyserNode
  // Explicitly backed by an ArrayBuffer (not the wider ArrayBufferLike that
  // `new Uint8Array(length)` infers), which is what getByteFrequencyData's
  // signature requires.
  private dataArray: Uint8Array<ArrayBuffer>

  constructor(audioContext: AudioContext, source: AudioNode) {
    this.analyser = audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    const bufferLength = this.analyser.frequencyBinCount
    this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength))
  }

  /**
   * Get average frequency data to determine mouth openness
   */
  getAverageFrequency(): number {
    this.analyser.getByteFrequencyData(this.dataArray)

    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i]
    }

    return sum / this.dataArray.length / 255 // Normalize to 0-1
  }

  /**
   * Detect speech activity
   */
  isSpeaking(): boolean {
    return this.getAverageFrequency() > 0.1
  }
}

/**
 * Lip-sync controller for mouth animations using Teeth bone
 */
export class LipSyncController {
  private teethBone: THREE.Bone | null = null
  private currentJawOpening = 0
  private targetJawOpening = 0
  private audioAnalyzer: AudioAnalyzer | null = null

  // Store original scale for proper lerping
  private originalTeethScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)

  constructor(gltf: any, audioContext?: AudioContext, audioSource?: AudioNode) {
    this.setupBones(gltf)

    if (audioContext && audioSource) {
      this.audioAnalyzer = new AudioAnalyzer(audioContext, audioSource)
    }
  }

  /**
   * Find and store references to animation bones
   */
  private setupBones(gltf: any) {
    if (gltf.scene) {
      gltf.scene.traverse((bone: THREE.Object3D) => {
        if (bone.name === 'Wolf3D_Teeth') {
          this.teethBone = bone as THREE.Bone
          // Store original scale for reference
          this.originalTeethScale.copy(this.teethBone.scale)
        }
      })
    }
  }

  /**
   * Update lip-sync based on phoneme
   */
  updatePhoneme(phoneme: string, duration = 100) {
    const jawOpening = PHONEME_MAP[phoneme] || PHONEME_MAP.neutral
    this.targetJawOpening = jawOpening
  }

  /**
   * Update lip-sync based on audio frequency analysis
   */
  updateFromAudio() {
    if (!this.audioAnalyzer) return

    const frequency = this.audioAnalyzer.getAverageFrequency()
    this.targetJawOpening = frequency * 0.35 // Scale to reasonable jaw movement
  }

  /**
   * Animate jaw movement smoothly by scaling Teeth bone
   * Moving teeth down (Y-axis) simulates jaw opening
   */
  animate(deltaTime: number) {
    if (!this.teethBone) return

    // Smooth interpolation towards target
    const speed = 0.15
    this.currentJawOpening += (this.targetJawOpening - this.currentJawOpening) * speed

    // Scale the teeth bone to simulate jaw opening
    // Scale down on Y-axis to move teeth downward (simulating jaw drop)
    const yScale = Math.max(0.3, 1 - this.currentJawOpening * 0.7)
    this.teethBone.scale.y = yScale

    // Also slightly move teeth in Y position for visual effect
    this.teethBone.position.y = this.currentJawOpening * 0.15

    // Optional: Add slight Z-scale compression when mouth opens
    const zScale = 1 - this.currentJawOpening * 0.1
    this.teethBone.scale.z = zScale
  }

  /**
   * Get current jaw opening (0-1)
   */
  getJawOpening(): number {
    return this.currentJawOpening / 0.35 // Normalize to 0-1 range
  }

  /**
   * Reset teeth to original state
   */
  reset() {
    if (!this.teethBone) return
    this.teethBone.scale.copy(this.originalTeethScale)
    this.teethBone.position.set(0, 0, 0)
    this.currentJawOpening = 0
    this.targetJawOpening = 0
  }
}

/**
 * Hand animation controller for natural gestures
 */
type ArmBoneKey = 'leftArm' | 'rightArm' | 'leftForeArm' | 'rightForeArm' | 'leftHand' | 'rightHand'

const ARM_BONE_NAMES: Record<ArmBoneKey, string> = {
  leftArm: 'LeftArm',
  rightArm: 'RightArm',
  leftForeArm: 'LeftForeArm',
  rightForeArm: 'RightForeArm',
  leftHand: 'LeftHand',
  rightHand: 'RightHand',
}

/**
 * Model-specific pose adjustments for avatars with different bone structures.
 * The hiring_manager model requires different hand pose offsets due to its
 * unique rigging and bone proportions compared to the other models.
 * Adjustments are applied as additional offsets on top of the base poses.
 */
export const MODEL_POSE_ADJUSTMENTS: Record<string, Record<string, HandPose>> = {
  '/models/hiring_manager.glb': {
    // Neutral: arms twisted 90 degrees inward
    neutral: {
      name: 'neutral',
      leftArm: { x: 0, y: 0.2, z: 0 },
      rightArm: { x: 0, y: 0.6, z: 0 },
      leftForeArm: { x: 0, y: 0, z: 0 },
      rightForeArm: { x: 0, y: 0, z: 0 },
      leftHand: { x: 0, y: 0, z: 0 },
      rightHand: { x: 0, y: 0, z: 0 },
    },
    // Explaining: use shoulder rotation to control arm spread
    explaining: {
      name: 'explaining',
      leftArm: { x: -0.1, y: 0, z: 0.12 },
      rightArm: { x: -0.1, y: 0, z: -0.12 },
      leftForeArm: { x: -0.4, y: 0, z: 0.1 },
      rightForeArm: { x: -0.4, y: 0, z: -0.1 },
      leftHand: { x: 0.12, y: 0, z: 0 },
      rightHand: { x: 0.12, y: 0, z: 0 },
    },
    // Emphasizing: stronger shoulder engagement
    emphasizing: {
      name: 'emphasizing',
      leftArm: { x: -0.12, y: 0, z: 0.15 },
      rightArm: { x: -0.12, y: 0, z: -0.15 },
      leftForeArm: { x: -0.45, y: 0, z: 0.15 },
      rightForeArm: { x: -0.45, y: 0, z: -0.15 },
      leftHand: { x: 0.08, y: 0, z: 0 },
      rightHand: { x: 0.08, y: 0, z: 0 },
    },
    // Pointing: controlled shoulder with forward extension
    pointing: {
      name: 'pointing',
      leftArm: { x: 0, y: 0, z: 0 },
      rightArm: { x: -0.12, y: 0, z: -0.1 },
      leftForeArm: { x: 0, y: 0, z: 0 },
      rightForeArm: { x: -0.5, y: 0, z: -0.08 },
      leftHand: { x: 0, y: 0, z: 0 },
      rightHand: { x: -0.1, y: 0, z: 0 },
    },
    // Thinking: one shoulder lifted with forearm up
    thinking: {
      name: 'thinking',
      leftArm: { x: -0.15, y: 0, z: 0.12 },
      rightArm: { x: -0.05, y: 0, z: -0.03 },
      leftForeArm: { x: -1.0, y: 0, z: 0.15 },
      rightForeArm: { x: -0.3, y: 0, z: 0 },
      leftHand: { x: 0.1, y: 0, z: 0 },
      rightHand: { x: 0.05, y: 0, z: 0 },
    },
    // Listening: both shoulders relaxed
    listening: {
      name: 'listening',
      leftArm: { x: -0.12, y: 0, z: 0.03 },
      rightArm: { x: -0.12, y: 0, z: -0.03 },
      leftForeArm: { x: -0.32, y: 0, z: 0 },
      rightForeArm: { x: -0.32, y: 0, z: 0 },
      leftHand: { x: 0.08, y: 0, z: 0 },
      rightHand: { x: 0.08, y: 0, z: 0 },
    },
  },
}

export class HandAnimationController {
  private bones: Partial<Record<ArmBoneKey, THREE.Object3D>> = {}
  /** Each bone's untouched bind-pose rotation, captured once at load. All
   * poses are applied as offsets composed onto these, so the model's own
   * natural arms-down rest pose is preserved instead of being overwritten. */
  private restQuaternions: Partial<Record<ArmBoneKey, THREE.Quaternion>> = {}
  /** Model-specific pose adjustments, if any */
  private poseAdjustments: Record<string, HandPose> | null = null

  private currentPose: HandPose = HAND_POSES.neutral
  private targetPose: HandPose | null = null
  private transitionProgress = 0
  private transitionDuration = 500 // milliseconds

  private readonly scratchEuler = new THREE.Euler()
  private readonly scratchOffset = new THREE.Quaternion()

  constructor(gltf: { scene?: THREE.Object3D }, modelUrl?: string) {
    this.setupBones(gltf)
    if (modelUrl) {
      this.poseAdjustments = MODEL_POSE_ADJUSTMENTS[modelUrl] || null
    }
  }

  private setupBones(gltf: { scene?: THREE.Object3D }) {
    if (!gltf.scene) return
    const byName = new Map<string, ArmBoneKey>(
      (Object.entries(ARM_BONE_NAMES) as Array<[ArmBoneKey, string]>).map(([key, name]) => [name, key]),
    )
    gltf.scene.traverse((obj) => {
      const key = byName.get(obj.name)
      if (!key || this.bones[key]) return
      this.bones[key] = obj
      this.restQuaternions[key] = obj.quaternion.clone()
    })
    this.relaxTPose(gltf.scene)
  }

  /** Some avatars ship rigged in a T-pose (arms straight out sideways)
   * rather than a relaxed A-pose. Gesture offsets are small by design, so
   * they can't rescue a T-pose. Rather than assume a rotation axis (which
   * differs per rig), measure the arm's real world-space direction and
   * compute the exact rotation that swings it down along the body, then
   * fold that into the stored rest pose so every later gesture layers on
   * top of a now-natural stance. */
  private relaxTPose(root: THREE.Object3D) {
    root.updateMatrixWorld(true)

    const relaxSide = (armKey: ArmBoneKey, endKey: ArmBoneKey, outwardX: number) => {
      const arm = this.bones[armKey]
      const end = this.bones[endKey]
      const rest = this.restQuaternions[armKey]
      if (!arm || !end || !rest) return

      const armPos = new THREE.Vector3()
      const endPos = new THREE.Vector3()
      arm.getWorldPosition(armPos)
      end.getWorldPosition(endPos)
      const current = endPos.sub(armPos).normalize()

      // Already hanging down? Leave this rig's own pose alone.
      if (current.y < -0.45) return

      // Target: mostly down, angled slightly away from the torso so the
      // arms rest beside the body instead of clipping into it.
      const desired = new THREE.Vector3(outwardX * 0.22, -1, 0.04).normalize()

      // Rotation in world space that maps current → desired...
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(current, desired)
      // ...converted into the bone's parent space, since bone.quaternion is
      // expressed relative to its parent.
      const parentWorld = new THREE.Quaternion()
      if (arm.parent) arm.parent.getWorldQuaternion(parentWorld)
      const parentInv = parentWorld.clone().invert()
      const localDelta = parentInv.multiply(worldDelta).multiply(parentWorld)

      rest.premultiply(localDelta)
      arm.quaternion.copy(rest)
      arm.updateMatrixWorld(true)
    }

    relaxSide('leftArm', 'leftHand', 1)
    relaxSide('rightArm', 'rightHand', -1)
  }

  transitionToPose(poseName: string, duration = 500) {
    // Check for model-specific adjustments first
    let next: HandPose | undefined
    if (this.poseAdjustments?.[poseName]) {
      next = this.poseAdjustments[poseName]
    } else {
      next = HAND_POSES[poseName]
    }

    next = next || HAND_POSES.neutral
    if (next === this.targetPose || (!this.targetPose && next === this.currentPose)) return
    this.targetPose = next
    this.transitionDuration = Math.max(1, duration)
    this.transitionProgress = 0
  }

  animate(deltaTime: number) {
    if (!this.targetPose) return

    this.transitionProgress += deltaTime
    const progress = Math.min(this.transitionProgress / this.transitionDuration, 1)
    const fromPose = this.currentPose
    const toPose = this.targetPose

    for (const key of Object.keys(ARM_BONE_NAMES) as ArmBoneKey[]) {
      const bone = this.bones[key]
      const rest = this.restQuaternions[key]
      if (!bone || !rest) continue

      const from = fromPose[key]
      const to = toPose[key]
      if (!from || !to) continue
      this.scratchEuler.set(
        THREE.MathUtils.lerp(from.x, to.x, progress),
        THREE.MathUtils.lerp(from.y, to.y, progress),
        THREE.MathUtils.lerp(from.z, to.z, progress),
      )
      this.scratchOffset.setFromEuler(this.scratchEuler)
      // rest * offset — offset is expressed in the bone's own local space,
      // so it reads as "bend this joint a bit from where it already is".
      bone.quaternion.copy(rest).multiply(this.scratchOffset)
    }

    if (progress >= 1) {
      this.currentPose = toPose
      this.targetPose = null
    }
  }

  getCurrentPoseName(): string {
    return this.currentPose.name
  }
}

/**
 * Body language controller for natural animations
 */
export class BodyLanguageController {
  private spine1: THREE.Object3D | null = null
  /** Bind-pose rotation of the spine, so posture is layered as an offset
   * rather than overwriting the model's own natural stance. */
  private spine1Rest: THREE.Quaternion | null = null

  private currentLanguage: BodyLanguagePose = BODY_LANGUAGE.attentive
  private targetLanguage: BodyLanguagePose | null = null
  private transitionProgress = 0
  private transitionDuration = 800

  private readonly scratchEuler = new THREE.Euler()
  private readonly scratchOffset = new THREE.Quaternion()

  constructor(gltf: { scene?: THREE.Object3D }) {
    this.setupBones(gltf)
  }

  private setupBones(gltf: { scene?: THREE.Object3D }) {
    if (!gltf.scene) return
    gltf.scene.traverse((obj) => {
      if (obj.name === 'Spine1' && !this.spine1) {
        this.spine1 = obj
        this.spine1Rest = obj.quaternion.clone()
      }
    })
  }

  transitionToLanguage(languageName: string, duration = 800) {
    const next = BODY_LANGUAGE[languageName] || BODY_LANGUAGE.attentive
    if (next === this.targetLanguage || (!this.targetLanguage && next === this.currentLanguage)) return
    this.targetLanguage = next
    this.transitionDuration = Math.max(1, duration)
    this.transitionProgress = 0
  }

  /** Spine posture only — head and neck are owned by the consumer
   * (PanelAvatarStage), which drives them every frame for idle sway,
   * breathing and speaker lean-in. Writing them from both places made the
   * two fight over the same bones. */
  animate(deltaTime: number) {
    if (!this.targetLanguage) return

    this.transitionProgress += deltaTime
    const progress = Math.min(this.transitionProgress / this.transitionDuration, 1)

    if (this.spine1 && this.spine1Rest) {
      const from = this.currentLanguage.spine
      const to = this.targetLanguage.spine
      this.scratchEuler.set(
        THREE.MathUtils.lerp(from.x, to.x, progress),
        THREE.MathUtils.lerp(from.y, to.y, progress),
        THREE.MathUtils.lerp(from.z, to.z, progress),
      )
      this.scratchOffset.setFromEuler(this.scratchEuler)
      this.spine1.quaternion.copy(this.spine1Rest).multiply(this.scratchOffset)
    }

    if (progress >= 1) {
      this.currentLanguage = this.targetLanguage
      this.targetLanguage = null
    }
  }

  getCurrentLanguage(): string {
    return this.currentLanguage.name
  }
}

/**
 * Main avatar animation manager
 */
export class AvatarAnimationManager {
  lipSync: LipSyncController
  handAnimations: HandAnimationController
  bodyLanguage: BodyLanguageController

  constructor(gltf: any, audioContext?: AudioContext, audioSource?: AudioNode, modelUrl?: string) {
    this.lipSync = new LipSyncController(gltf, audioContext, audioSource)
    this.handAnimations = new HandAnimationController(gltf, modelUrl)
    this.bodyLanguage = new BodyLanguageController(gltf)

    // Start with neutral/attentive poses
    this.handAnimations.transitionToPose('neutral', 0)
    this.bodyLanguage.transitionToLanguage('attentive', 0)
  }

  /**
   * Update all animations
   */
  update(deltaTime: number) {
    // NOTE: lipSync is deliberately NOT driven here. These avatars carry
    // real viseme + jawOpen morph targets on Wolf3D_Head/Wolf3D_Teeth, and
    // PanelAvatarStage drives those directly from word-timed visemes. The
    // bone-scaling LipSyncController below is the older fallback for rigs
    // without morph targets; running both at once made the two fight over
    // the teeth bone every frame (squashing the mesh instead of syncing).
    this.handAnimations.animate(deltaTime)
    this.bodyLanguage.animate(deltaTime)
  }

  /**
   * Trigger a speaking gesture based on speech characteristics
   */
  triggerSpeakingGesture(intensity: 'low' | 'medium' | 'high') {
    switch (intensity) {
      case 'low':
        this.handAnimations.transitionToPose('listening', 400)
        this.bodyLanguage.transitionToLanguage('attentive', 400)
        break
      case 'medium':
        this.handAnimations.transitionToPose('explaining', 500)
        this.bodyLanguage.transitionToLanguage('engaged', 500)
        break
      case 'high':
        this.handAnimations.transitionToPose('emphasizing', 600)
        this.bodyLanguage.transitionToLanguage('engaged', 600)
        break
    }
  }

  /**
   * Stop animations and return to neutral
   */
  reset() {
    this.handAnimations.transitionToPose('neutral', 300)
    this.bodyLanguage.transitionToLanguage('attentive', 300)
  }
}
