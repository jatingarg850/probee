'use client'

import { useCallback, useEffect, useState } from 'react'

import { Check, PhoneOff, Settings } from '@/components/ui/icons'
import type { IMicrophoneAudioTrack } from 'agora-rtc-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface MicrophoneSelectorProps {
  localMicrophoneTrack: IMicrophoneAudioTrack | null
  /** Ends the call. Rendered as an item in this same settings menu — the
   * mic gear is the one control surface always on screen during the call,
   * so it's also where "end the interview" lives, alongside the dedicated
   * hang-up button in the controls row. */
  onEndConversation?: () => void
}

interface MicrophoneDevice {
  deviceId: string
  label: string
}

export function MicrophoneSelector({ localMicrophoneTrack, onEndConversation }: MicrophoneSelectorProps) {
  const [devices, setDevices] = useState<MicrophoneDevice[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const fetchMicrophones = useCallback(async () => {
    try {
      const AgoraRTC = (await import('agora-rtc-react')).default
      const microphones = await AgoraRTC.getMicrophones()

      setDevices(
        microphones.map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`,
        })),
      )

      if (localMicrophoneTrack) {
        const currentLabel = localMicrophoneTrack.getTrackLabel()
        const currentDevice = microphones.find((device) => device.label === currentLabel)
        if (currentDevice) {
          setCurrentDeviceId(currentDevice.deviceId)
        }
      }
    } catch (error) {
      console.error('Error fetching microphones:', error)
    }
  }, [localMicrophoneTrack])

  useEffect(() => {
    if (localMicrophoneTrack) {
      fetchMicrophones()
    }
  }, [fetchMicrophones, localMicrophoneTrack])

  const handleDeviceChange = async (deviceId: string) => {
    if (!localMicrophoneTrack) return

    try {
      await localMicrophoneTrack.setDevice(deviceId)
      setCurrentDeviceId(deviceId)
    } catch (error) {
      console.error('Error changing microphone device:', error)
    }
  }

  useEffect(() => {
    const setupDeviceChangeListener = async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-react')).default

        AgoraRTC.onMicrophoneChanged = async (changedDevice) => {
          await fetchMicrophones()

          if (changedDevice.state === 'ACTIVE' && localMicrophoneTrack) {
            await localMicrophoneTrack.setDevice(changedDevice.device.deviceId)
            setCurrentDeviceId(changedDevice.device.deviceId)
          } else if (
            changedDevice.device.label === localMicrophoneTrack?.getTrackLabel() &&
            changedDevice.state === 'INACTIVE'
          ) {
            const microphones = await AgoraRTC.getMicrophones()
            if (microphones[0] && localMicrophoneTrack) {
              await localMicrophoneTrack.setDevice(microphones[0].deviceId)
              setCurrentDeviceId(microphones[0].deviceId)
            }
          }
        }
      } catch (error) {
        console.error('Error setting up device change listener:', error)
      }
    }

    setupDeviceChangeListener()

    return () => {
      import('agora-rtc-react').then(({ default: AgoraRTC }) => {
        AgoraRTC.onMicrophoneChanged = undefined
      })
    }
  }, [fetchMicrophones, localMicrophoneTrack])

  const hasMultipleDevices = devices.length > 1

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-border bg-secondary hover:bg-accent/10"
          title="Call settings"
        >
          <Settings className="h-4 w-4 text-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56 border-border bg-popover">
        {hasMultipleDevices ? (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Microphone</div>
            {devices.map((device) => (
              <DropdownMenuItem
                key={device.deviceId}
                onClick={() => handleDeviceChange(device.deviceId)}
                className={
                  device.deviceId === currentDeviceId
                    ? 'cursor-pointer bg-accent/15 text-primary'
                    : 'cursor-pointer text-foreground hover:bg-accent/10'
                }
              >
                <span className="truncate">{device.label}</span>
                {device.deviceId === currentDeviceId && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
            {onEndConversation ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {onEndConversation ? (
          <DropdownMenuItem
            onClick={onEndConversation}
            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            <span>End interview</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
