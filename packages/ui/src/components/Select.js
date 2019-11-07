import React from "react";
import ReactSelect, { components as selectComponents } from "react-select";
import Icon from "./Icon";

const DropdownIndicator = props => {
  return (
    selectComponents.DropdownIndicator && (
      <selectComponents.DropdownIndicator {...props}>
        <Icon name="dropdown" />
      </selectComponents.DropdownIndicator>
    )
  );
};

const customStyles = {
  container: (provided, { selectProps }) => ({
    ...provided,
    boxShadow: selectProps.menuIsOpen
      ? "0px 3px 7px 0 rgba(0, 0, 0, 0.35)"
      : "",
    borderRadius: "4px"
  }),
  control: (provided, state) => ({
    ...provided,
    minHeight: "40px",
    border: "1px solid #cfcfcf",
    borderBottomColor: state.selectProps.menuIsOpen ? "#e4e4e4" : "#cfcfcf",
    backgroundColor: "white",
    boxShadow: "none",
    cursor: "pointer",
    borderRadius: state.selectProps.menuIsOpen ? "4px 4px 0px 0px" : "4px",
    "&:hover": {
      borderColor: "#cfcfcf"
    },
    paddingLeft: "12px",
    "&:hover": {
      borderColor: "#cfcfcf"
    }
  }),
  dropdownIndicator: provided => ({
    ...provided,
    padding: "0 10px"
  }),

  indicatorSeparator: () => ({
    display: "none"
  }),
  menu: provided => ({
    ...provided,
    borderRadius: "0px 0px 4px 4px",
    margin: "0px 0px 8px 1px",
    boxShadow: "0px 3px 7px 0 rgba(0, 0, 0, 0.35)",
    width: "calc(100% - 2px)"
  }),
  menuList: provided => ({
    ...provided,
    padding: 0,
    borderRadius: "0px 0px 4px 4px"
  }),
  option: (provided, state) => ({
    ...provided,
<<<<<<< HEAD
    backgroundColor: 'white',
    color: 'inherit',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: '#e4e4e4',
    },
  }),
  singleValue: provided => ({
    ...provided,
    alignItems: 'center',
    color: '#3b3e45',
    display: 'flex',
    fontSize: '14px',
    minHeight: '16px',
    margin: '0'
=======
    backgroundColor: "white",
    color: "inherit",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: "#e4e4e4"
    }
>>>>>>> 2e7cd383a1d55c4ee68c0f94cfea064476bc77ea
  })
};

class Select extends React.Component {
  render() {
    const {
      options,
      value,
      onChange,
      onMouseDown,
      selectConfig,
      components = {},
      className
    } = this.props;

    return (
      <div onMouseDown={onMouseDown} className={className}>
        <ReactSelect
          {...selectConfig}
          components={{ ...components, DropdownIndicator }}
          defaultValue={options[0]}
          value={options.find(o => o.value === value)}
          options={options}
          styles={customStyles}
          onChange={({ value }) => onChange && onChange(value)}
        />
      </div>
    );
  }
}

Select.components = selectComponents;

export default Select;
