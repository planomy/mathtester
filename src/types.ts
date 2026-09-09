export type Tool =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'ruler'
  | 'text'

export type MarkTool = 'tick' | 'cross' | 'pen' | 'text' | 'eraser'

export type Point = { x: number; y: number }

export type Stroke = {
  id: string
  tool: Exclude<Tool, 'text'>
  color: string
  width: number
  points: Point[]
}

export type TextItem = {
  id: string
  x: number
  y: number
  text: string
  color: string
  size: number
}

export type PageInk = {
  strokes: Stroke[]
  texts: TextItem[]
}

export type Question = {
  id: string
  prompt: string
  /** Teacher-only answer / marking guide — never sent to students */
  answer?: string
}

export type Test = {
  id: string
  title: string
  questions: Question[]
  allowTyping: boolean
  code: string
  createdAt: string
  updatedAt: string
  published: boolean
}

export type TeacherProfile = {
  name: string
  email: string
  pin: string
}

export type Submission = {
  id: string
  testId: string
  testTitle: string
  testCode: string
  studentName: string
  submittedAt: string
  pages: PageInk[]
  questionPrompts: string[]
  /** Teacher annotations over student working */
  markPages?: PageInk[]
  status?: 'received' | 'marked'
  markedAt?: string
}

export type StudentAttempt = {
  testId: string
  testCode: string
  studentName: string
  pages: PageInk[]
  startedAt: string
}
