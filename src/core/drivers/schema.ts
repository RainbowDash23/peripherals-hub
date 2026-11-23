import { z } from 'zod';

const hexOrNumberSchema = z.union([
  z.number(),
  z.string().regex(/^0x[0-9a-fA-F]+$/i, 'Debe ser un valor hexadecimal como 0x3151 o un numero'),
]);

export const DeviceIdMatchSchema = z.object({
  vendorId: hexOrNumberSchema,
  productId: hexOrNumberSchema,
  name: z.string().optional(),
});

export const ControlInterfaceMatchSchema = z.object({
  usagePage: hexOrNumberSchema,
  usage: hexOrNumberSchema,
});

export const SliderControlSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
});

export const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const SelectControlSchema = z.object({
  options: z.array(SelectOptionSchema).min(1),
});

export const ToggleControlSchema = z.object({
  onLabel: z.string().optional(),
  offLabel: z.string().optional(),
});

export const ColorControlSchema = z.object({
  format: z.enum(['hex', 'rgb']).optional(),
});

export const ReadonlyControlSchema = z.object({
  unit: z.string().optional(),
});

export const KeyMatrixFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  primitive: z.enum(['slider', 'select', 'toggle', 'readonly']),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  options: z.array(SelectOptionSchema).optional(),
});

export const KeyMatrixControlSchema = z.object({
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  totalKeys: z.number().int().positive(),
  rowLabels: z.array(z.array(z.string())).optional(),
  fields: z.array(KeyMatrixFieldSchema),
});

export const BaseCapabilityFields = {
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  preset: z.string().optional(),
};

export const SliderCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('slider'),
  config: SliderControlSchema.optional(),
});

export const SelectCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('select'),
  config: SelectControlSchema.optional(),
});

export const ToggleCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('toggle'),
  config: ToggleControlSchema.optional(),
});

export const ColorCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('color'),
  config: ColorControlSchema.optional(),
});

export const ReadonlyCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('readonly'),
  config: ReadonlyControlSchema.optional(),
});

export const KeyMatrixCapabilitySchema = z.object({
  ...BaseCapabilityFields,
  primitive: z.literal('key-matrix'),
  config: KeyMatrixControlSchema.optional(),
});

export const CapabilityDescriptorSchema = z.discriminatedUnion('primitive', [
  SliderCapabilitySchema,
  SelectCapabilitySchema,
  ToggleCapabilitySchema,
  ColorCapabilitySchema,
  ReadonlyCapabilitySchema,
  KeyMatrixCapabilitySchema,
]);

export const DriverManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-_]+$/, 'El id debe contener solo letras minusculas, numeros, guiones y guiones bajos'),
  name: z.string().min(1),
  category: z.enum(['mouse', 'keyboard', 'keypad', 'audio', 'other']),
  version: z.string().default('1.0.0'),
  devices: z.array(DeviceIdMatchSchema).min(1, 'El manifest debe definir al menos un dispositivo en devices'),
  controlInterface: ControlInterfaceMatchSchema,
  capabilities: z.array(CapabilityDescriptorSchema),
});

export type DriverManifestInput = z.infer<typeof DriverManifestSchema>;
