import React from 'react';
import {Provider} from 'react-redux';
import App from './components/App';
import createStore from './store';

class Root extends React.Component {

  store = createStore();
  currentContent;

  componentDidMount() {
    this.store.subscribe(() => {
      const state = this.store.getState();
      const content = state.threed.scene.objects;
      if (this.currentContent && content !== this.currentContent) {
        if (this.props.onContentChange) {
          this.props.onContentChange(content);
        }
      }
      this.currentContent = content;
    });
  }

  render() {
    return (
      <Provider store={this.store}>
        <App {...this.props} />
      </Provider>
    );
  }
}

export default Root;