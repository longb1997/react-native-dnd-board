import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  ScrollView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import style from './style';
import Column from './components/column';
import Repository from './handlers/repository';
import Utils from './commons/utils';

const SCROLL_THRESHOLD = 50;
const SCROLL_STEP = 0;

const DraggableBoard = ({
  repository,
  renderColumnWrapper,
  renderRow,
  columnWidth,
  accessoryRight,
  activeRowStyle,
  activeRowRotation = 8,
  xScrollThreshold = SCROLL_THRESHOLD,
  yScrollThreshold = SCROLL_THRESHOLD,
  dragRangeFactor = 1,
  onRowPress = () => { },
  onDragStart = () => { },
  onDragEnd = () => { },
  style: boardStyle,
  horizontal = true,
}) => {
  const [, setForceUpdate] = useState(false);
  const [hoverComponent, setHoverComponent] = useState(null);
  const [movingMode, setMovingMode] = useState(false);

  const autoScrollInterval = useRef(null);

  let translateX = useSharedValue(0);
  let translateY = useSharedValue(0);

  const scrollViewRef = useRef();
  const scrollOffset = useRef(0);
  const hoverRowItem = useRef(null);

  const snapToInterval = columnWidth || (Utils.deviceWidth - 10); // You can set somePadding to center the column

  useEffect(() => {
    repository.setReload(() => setForceUpdate(prevState => !prevState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listenRowChangeColumn = (fromColumnId, toColumnId) => {
    hoverRowItem.current.columnId = toColumnId;
    hoverRowItem.current.oldColumnId = fromColumnId;
  };

  const handleRowPosition = ([x, y]) => {
    if (autoScrollInterval.current) {
      clearInterval(autoScrollInterval.current);
      autoScrollInterval.current = null;
    }
    if (hoverRowItem.current && (x || y)) {
        const columnAtPosition = repository.moveRow(
          hoverRowItem.current,
          x,
          y,
          listenRowChangeColumn
        )

        if (columnAtPosition && scrollViewRef.current) {

          // When at the right edge, start an interval to keep scrolling
          if (x + xScrollThreshold > Utils.deviceWidth) {
            autoScrollInterval.current = setInterval(() => {
              scrollOffset.current += SCROLL_STEP;
              scrollViewRef?.current?.scrollTo({
                x: (scrollOffset.current * dragRangeFactor) + columnWidth,
                y: 0,
                animated: true,
              });
            }, 800);
          } else if (x < xScrollThreshold) { // When at the left edge, start an interval to keep scrolling
            autoScrollInterval.current = setInterval(() => {
              scrollOffset.current -= SCROLL_STEP;
              scrollViewRef?.current?.scrollTo({
                x: (scrollOffset.current / dragRangeFactor) - columnWidth,
                y: 0,
                animated: true,
              });
            }, 800);
          }
          repository.measureColumnsLayout();
        }
    }
  };

  const onScroll = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
  };

  const onScrollEnd = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
    repository.measureColumnsLayout();
  };

  const keyExtractor = useCallback(
    (item, index) => `${item.id}${item.name}${index}`,
    [],
  );

  const animatedStyles = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${activeRowRotation}deg` },
    ],
  }));

  const renderHoverComponent = () => {
    if (hoverComponent && hoverRowItem.current) {
      
      const row = repository.findRow(hoverRowItem.current);

      if (row && row.layout) {
        const { x, y, width, height } = row.layout;
        const hoverStyle = [
          style.hoverComponent,
          activeRowStyle,
          animatedStyles,
          {
            top: y - yScrollThreshold,
            left: x,
            width,
            height,
          },
        ];

        return (
          <Animated.View style={hoverStyle}>{hoverComponent}</Animated.View>
        );
      }
    }
  };

  const moveItem = async (hoverItem, rowItem, isColumn = false) => {
    rowItem.setHidden(true);
    repository.hideRow(rowItem);
    await rowItem.measureLayout();
    hoverRowItem.current = { ...rowItem };

    setMovingMode(true);
    setHoverComponent(hoverItem);
  };

  const drag = column => {
    const hoverColumn = renderColumnWrapper({
      move: moveItem,
      item: column.data,
      index: column.index,
    });
    moveItem(hoverColumn, column, true);
  };

  const _onDragStart = (rowItem) => {
    const columnId = rowItem.columnId; // rowItem should have the columnId property
    const column = repository.getColumnById(columnId);
    
    if (column && column.ref) {
      column.ref.measureLayout(scrollViewRef.current, (x, y, width, height) => {
        const scrollViewWidth = Utils.deviceWidth;
        const targetScrollX = x + width / 2 - scrollViewWidth / 2;
        scrollViewRef.current.scrollTo({
          x: targetScrollX,
          y: 0,
          animated: true,
        });
      });
    }

    onDragStart && onDragStart(column)
  };
  

  const renderColumns = () => {
    const columns = repository.getColumns();
    return columns.map((column, index) => {
      const key = keyExtractor(column, index);

      const columnComponent = (
        <Column
          repository={repository}
          column={column}
          move={moveItem}
          renderColumnWrapper={renderColumnWrapper}
          keyExtractor={keyExtractor}
          renderRow={renderRow}
          scrollEnabled={!movingMode}
          columnWidth={columnWidth}
          onRowPress={onRowPress}
          onDragStartCallback={_onDragStart}
        />
      );

      return renderColumnWrapper({
        item: column.data,
        index: column.index,
        columnComponent,
        drag: () => drag(column),
        layoutProps: {
          key,
          ref: ref => repository.updateColumnRef(column.id, ref),
          onLayout: layout => repository.updateColumnLayout(column.id),
        },
      });
    });
  };

   // delay resetLayout
   const resetLayout = useCallback(() => {
    setTimeout(() => {
      translateX.value = 0;
      translateY.value = 0;
    }, 100);
  }, []);

    const onEndDrag = () => {
      setHoverComponent(null);
      setMovingMode(false);
      if (onDragEnd
        && hoverRowItem.current
        && hoverRowItem.current.oldColumnId
        && hoverRowItem.current.columnId) {
        onDragEnd(
          hoverRowItem.current?.oldColumnId,
          hoverRowItem.current?.columnId,
          hoverRowItem.current,
        );
        repository.updateOriginalData();
      }
      if (hoverRowItem.current) repository.showRow(hoverRowItem.current);
      hoverRowItem.current = null;
    };å

  /**--------------------------------------------------------
   * Gesture 
   * -------------------------------------------------------*/
    const onGesture = Gesture.Pan()
    .onUpdate(event => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      runOnJS(handleRowPosition)([event.absoluteX, event.absoluteY]);
    })
    .onEnd(event => {
      if (movingMode) {
        runOnJS(resetLayout)();
      }
    })
    .onTouchesUp(() => {
      runOnJS(onEndDrag)();
    });

  return (
    <GestureDetector gesture={onGesture}>
        <Animated.View style={[style.container, boardStyle]}>
          <ScrollView
            ref={scrollViewRef}
            scrollEnabled={!movingMode}
            horizontal={horizontal}
            snapToInterval={snapToInterval}
            snapToAlignment={'center'}
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollEndDrag={onScrollEnd}
            onMomentumScrollEnd={onScrollEnd}>
            {renderColumns()}
            {Utils.isFunction(accessoryRight) ? accessoryRight() : accessoryRight}
          </ScrollView>
          {renderHoverComponent()}
        </Animated.View>
    </GestureDetector>
  );
};

export default DraggableBoard;
export { Repository };
