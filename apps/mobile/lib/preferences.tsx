import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const Context = createContext<{
  dataSaver: boolean;
  setDataSaver: (value: boolean) => Promise<void>;
} | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [dataSaver, set] = useState(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem('auction-ng.data-saver.v1')
      .then((value) => {
        if (active) set(value === 'true');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const setDataSaver = async (value: boolean) => {
    await AsyncStorage.setItem('auction-ng.data-saver.v1', String(value));
    set(value);
  };
  return (
    <Context.Provider value={{ dataSaver, setDataSaver }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw Error('Preferences provider missing.');
  return value;
}
