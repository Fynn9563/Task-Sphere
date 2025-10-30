import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Combobox } from '@headlessui/react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import Fuse from 'fuse.js';
import { getAvatarUrl } from '../../utils/gravatar';

const SearchableCombobox = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Search or select...',
  displayValue,
  showAvatar = false,
  getAvatarEmail = null,
  getAvatarCustomUrl = null
}) => {
  const [query, setQuery] = useState('');

  // Configure fuzzy search with Fuse.js
  const fuse = useMemo(() => {
    return new Fuse(options, {
      keys: ['name'],
      threshold: 0.3, // 0 = exact match, 1 = match anything
      ignoreLocation: true,
      minMatchCharLength: 1,
      includeScore: true
    });
  }, [options]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (query === '') {
      return options;
    }
    return fuse.search(query).map(result => result.item);
  }, [query, options, fuse]);

  // Get display name for current selection
  const getDisplayName = () => {
    const selectedOption = options.find(opt => opt.name === value);
    if (displayValue && selectedOption) {
      return displayValue(selectedOption);
    }
    if (selectedOption) {
      return selectedOption.name;
    }
    // Use displayValue for empty/null values
    if (displayValue) {
      return displayValue(null);
    }
    return placeholder || 'Select...';
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}

      <Combobox value={value} onChange={onChange}>
        <div className="relative">
          <div className="relative w-full">
            <Combobox.Input
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
              displayValue={getDisplayName}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
            />

            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronsUpDown className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </Combobox.Button>

            {/* Clear button when searching */}
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-8 flex items-center pr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-700 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {filteredOptions.length === 0 ? (
              <div className="relative cursor-default select-none py-2 px-4 text-gray-500 dark:text-gray-400">
                No results found
              </div>
            ) : (
              <>
                {filteredOptions
                  .filter(option => option.name && option.name.trim() !== '') // Filter out empty options
                  .map((option) => {
                    const avatarEmail = showAvatar && getAvatarEmail ? getAvatarEmail(option) : null;
                    const customAvatarUrl = showAvatar && getAvatarCustomUrl ? getAvatarCustomUrl(option) : null;
                    const avatarUrl = avatarEmail ? getAvatarUrl(avatarEmail, customAvatarUrl, 32) : null;

                    return (
                      <Combobox.Option
                        key={option.id}
                        value={option.name}
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 ${showAvatar ? 'pl-12' : 'pl-10'} pr-4 ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-900 dark:text-white'
                          }`
                        }
                      >
                        {({ selected, active }) => (
                          <>
                            {showAvatar && avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={option.name}
                                className="absolute inset-y-0 left-2 my-auto w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600"
                              />
                            ) : (
                              selected && (
                                <span
                                  className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                    active ? 'text-white' : 'text-blue-600'
                                  }`}
                                >
                                  <Check className="w-4 h-4" aria-hidden="true" />
                                </span>
                              )
                            )}
                            <span
                              className={`block truncate ${
                                selected ? 'font-medium' : 'font-normal'
                              }`}
                            >
                              {option.name}
                            </span>
                          </>
                        )}
                      </Combobox.Option>
                    );
                  })}

                {/* Show count of results when filtering */}
                {query && (
                  <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {filteredOptions.length} of {options.length} results
                  </div>
                )}
              </>
            )}
          </Combobox.Options>
        </div>
      </Combobox>
    </div>
  );
};

SearchableCombobox.propTypes = {
  label: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired
    })
  ).isRequired,
  placeholder: PropTypes.string,
  displayValue: PropTypes.func,
  showAvatar: PropTypes.bool,
  getAvatarEmail: PropTypes.func,
  getAvatarCustomUrl: PropTypes.func
};

export default SearchableCombobox;
