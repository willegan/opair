export interface Department {
  id: string
  name: string
  parent_id: string | null
  created_at: string
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[]
}
