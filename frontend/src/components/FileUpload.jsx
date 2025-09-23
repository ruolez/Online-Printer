import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Upload, FileText, X, Check, AlertCircle, Loader2, Printer } from 'lucide-react'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import { cn } from '../lib/utils'
import { StationSelector } from './StationSelector'

const API_URL = '/api'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_FILE_TYPE = 'application/pdf'

export function FileUpload({ token, onUploadSuccess, onUploadError, className }) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState(null) // 'success', 'error', null
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedStation, setSelectedStation] = useState(null)
  const [autoAddToPrintQueue, setAutoAddToPrintQueue] = useState(() => {
    const saved = localStorage.getItem('autoAddToPrintQueue')
    return saved !== 'false' // Default to true
  })
  const fileInputRef = useRef(null)

  // Load saved station on mount
  useEffect(() => {
    const savedStation = localStorage.getItem('defaultPrinterStation')
    if (savedStation) {
      setSelectedStation(parseInt(savedStation))
    }
  }, [])

  const validateFile = useCallback((file) => {
    if (file.type !== ALLOWED_FILE_TYPE) {
      return 'Please select a PDF file only'
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }
    return null
  }, [])

  const handleFiles = useCallback((files) => {
    if (files.length === 0) return

    const file = files[0]
    const validationError = validateFile(file)

    if (validationError) {
      setErrorMessage(validationError)
      setUploadStatus('error')
      return
    }

    setSelectedFile(file)
    setUploadStatus(null)
    setErrorMessage('')
  }, [validateFile])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [handleFiles])

  const handleFileInputChange = useCallback((e) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }, [handleFiles])

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null)
    setUploadStatus(null)
    setErrorMessage('')
    setUploadProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setErrorMessage('Authentication token not found. Please log in again.')
      setUploadStatus('error')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadStatus(null)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(Math.round(percentComplete))
        }
      })

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            const response = JSON.parse(xhr.responseText)
            setUploadStatus('success')
            setUploadProgress(100)

            // Add to print queue if auto-add is enabled
            if (autoAddToPrintQueue && response.file && response.file.id) {
              try {
                const printQueueResponse = await fetch(`${API_URL}/print-queue/add/${response.file.id}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    station_id: selectedStation
                  })
                })

                if (printQueueResponse.ok) {
                  console.log('File added to print queue', selectedStation ? `for station ${selectedStation}` : 'locally')
                }
              } catch (e) {
                console.error('Error adding to print queue:', e)
              }
            }

            // Immediately trigger success callback for refresh
            onUploadSuccess?.(response)
            // Clear the selected file after showing success
            setTimeout(() => {
              setSelectedFile(null)
              setUploadStatus(null)
              setUploadProgress(0)
            }, 2000)
          } catch {
            setErrorMessage('Invalid response from server')
            setUploadStatus('error')
            onUploadError?.(new Error('Invalid response'))
          }
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText)
            setErrorMessage(errorResponse.message || 'Upload failed')
          } catch {
            setErrorMessage(`Upload failed with status: ${xhr.status}`)
          }
          setUploadStatus('error')
          onUploadError?.(new Error('Upload failed'))
        }
        setUploading(false)
      })

      xhr.addEventListener('error', () => {
        setErrorMessage('Network error occurred during upload')
        setUploadStatus('error')
        setUploading(false)
        onUploadError?.(new Error('Network error'))
      })

      xhr.open('POST', `${API_URL}/upload`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(formData)
    } catch (error) {
      setErrorMessage('An unexpected error occurred')
      setUploadStatus('error')
      setUploading(false)
      onUploadError?.(error)
    }
  }, [selectedFile, token, onUploadSuccess, onUploadError])

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload PDF File
        </CardTitle>
        <CardDescription>
          Upload a PDF file for processing. Maximum file size: {MAX_FILE_SIZE / 1024 / 1024}MB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drag and Drop Zone */}
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50',
            selectedFile && 'border-solid border-muted-foreground/50'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={!selectedFile ? handleBrowseClick : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {!selectedFile ? (
            <div className="space-y-3">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {dragActive ? 'Drop your PDF file here' : 'Drag & drop your PDF file here'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse files
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-lg">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveFile}
                className="mt-2"
                disabled={uploading}
              >
                <X className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>
          )}
        </div>

        {/* Station Selection and Print Options */}
        <div className="space-y-4 border-t pt-4">
          <StationSelector
            token={token}
            value={selectedStation}
            onChange={setSelectedStation}
          />

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-print" className="flex items-center gap-2 cursor-pointer">
              <Printer className="h-4 w-4" />
              Auto-add to print queue
            </Label>
            <Switch
              id="auto-print"
              checked={autoAddToPrintQueue}
              onCheckedChange={(checked) => {
                setAutoAddToPrintQueue(checked);
                localStorage.setItem('autoAddToPrintQueue', checked);
              }}
            />
          </div>

          {autoAddToPrintQueue && (
            <p className="text-xs text-muted-foreground">
              Files will be automatically added to the print queue after upload
              {selectedStation ? " and sent to the selected printer station" : ""}
            </p>
          )}
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        )}

        {/* Status Messages */}
        {uploadStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 text-sm text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20 rounded-md">
            <Check className="h-4 w-4" />
            File uploaded successfully!
          </div>
        )}

        {uploadStatus === 'error' && errorMessage && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        )}

        {/* Upload Button */}
        {selectedFile && uploadStatus !== 'success' && (
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        )}

        {/* Browse Button (when no file selected) */}
        {!selectedFile && (
          <Button
            variant="outline"
            onClick={handleBrowseClick}
            className="w-full"
            size="lg"
          >
            <FileText className="mr-2 h-4 w-4" />
            Browse Files
          </Button>
        )}
      </CardContent>
    </Card>
  )
}