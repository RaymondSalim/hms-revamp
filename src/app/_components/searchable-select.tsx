"use client";

import Select, { type StylesConfig, type GroupBase } from "react-select";

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  isClearable?: boolean;
}

const customStyles: StylesConfig<SelectOption, false, GroupBase<SelectOption>> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "var(--color-bg-card)",
    borderColor: state.isFocused ? "var(--color-accent)" : "var(--color-border)",
    borderRadius: "var(--radius-lg)",
    fontSize: "0.875rem",
    minHeight: "42px",
    boxShadow: state.isFocused ? "0 0 0 1px var(--color-accent)" : "none",
    "&:hover": {
      borderColor: "var(--color-accent)",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "2px 12px",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    zIndex: 50,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--color-accent)"
      : state.isFocused
        ? "var(--color-accent-light)"
        : "transparent",
    color: state.isSelected ? "white" : "var(--color-text-primary)",
    fontSize: "0.875rem",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    "&:active": {
      backgroundColor: "var(--color-accent-light)",
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--color-text-primary)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
  }),
  input: (base) => ({
    ...base,
    color: "var(--color-text-primary)",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
    padding: "0 12px 0 8px",
    "& svg": { width: "16px", height: "16px" },
    "&:hover": {
      color: "var(--color-text-primary)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
    "&:hover": {
      color: "#DC2626",
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: "var(--color-text-secondary)",
    fontSize: "0.875rem",
  }),
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  required,
  isClearable = true,
}: SearchableSelectProps) {
  const selectedOption = options.find((o) => o.value === value) ?? null;

  return (
    <Select
      options={options}
      value={selectedOption}
      onChange={(opt) => onChange(opt?.value ?? "")}
      placeholder={placeholder}
      isClearable={isClearable}
      isSearchable
      styles={customStyles}
      noOptionsMessage={() => "Tidak ditemukan"}
      required={required}
    />
  );
}
