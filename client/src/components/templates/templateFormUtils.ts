import type { Template } from '../../types';

interface TemplateFormValues {
  name: string;
  description: string;
  languages: string;
  originalBusinessName: string;
  originalDomain: string;
}

export function buildTemplateFormData(values: TemplateFormValues, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', values.name.trim());
  formData.append('description', values.description.trim());
  formData.append('languages', JSON.stringify(values.languages.split(',').map((item) => item.trim()).filter(Boolean)));
  formData.append('originalBusinessName', values.originalBusinessName.trim() || '{{NAME}}');
  formData.append('originalDomain', values.originalDomain.trim() || '{{DOMAIN}}');
  return formData;
}

export function buildTemplateMetadataPayload(values: TemplateFormValues): Partial<Template> {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    languages: JSON.stringify(values.languages.split(',').map((item) => item.trim()).filter(Boolean)),
    originalBusinessName: values.originalBusinessName.trim() || '{{NAME}}',
    originalDomain: values.originalDomain.trim() || '{{DOMAIN}}',
  };
}